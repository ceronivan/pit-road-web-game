import type {
    ComponenteCircuito, CircuitoDef, CircuitoComputado,
    PuntoRuta, Segmento, ModificadoresSegmento,
    PerfilCircuito, ArquetipoRival, TipoComponente,
} from '../types';
import circuitosData from '../data/circuitos.json';

// ── Canvas area where the circuit is drawn (must match CarreraScene layout) ──
export const CIRCUIT_AREA = { x: 20, y: 32, w: 440, h: 164 };

// Sampling step in world units (smaller = smoother curves)
const STEP = 6;

// ── Auto-modifier formulas ────────────────────────────────────────────────────
const RADIO_REF   = 60;   // meters — reference for normalizing curve tightness
const LONGITUD_REF = 400; // meters — reference straight length

function clamp(v: number, lo: number, hi: number) {
    return Math.min(hi, Math.max(lo, v));
}

function modificadoresDeComponente(comp: ComponenteCircuito): ModificadoresSegmento {
    switch (comp.tipo) {
        case 'recta': {
            const L = comp.longitud ?? 200;
            return {
                topSpeed:     clamp(0.75 + L / LONGITUD_REF * 0.5,  0.80, 1.35),
                handling:     0.50,
                acceleration: clamp(0.85 + L / LONGITUD_REF * 0.15, 0.85, 1.10),
            };
        }
        case 'curva_abierta':
        case 'curva_cerrada': {
            const R = comp.radio ?? RADIO_REF;
            return {
                topSpeed:     clamp(R / 100,              0.30, 1.10),
                handling:     clamp(2.5 - R / 60,         0.80, 2.00),
                acceleration: clamp(0.25 + R / 200,       0.30, 0.70),
            };
        }
        case 'chicane':
            return { topSpeed: 0.40, handling: 1.80, acceleration: 0.65 };
        case 'horquilla': {
            const R = comp.radio ?? 18;
            return {
                topSpeed:     clamp(R / 100, 0.20, 0.40),
                handling:     2.00,
                acceleration: 0.50,
            };
        }
    }
}

// ── Turtle graphics ───────────────────────────────────────────────────────────
interface Turtle { x: number; y: number; angle: number; }

function addRecta(
    pts: PuntoRuta[], t: Turtle,
    L: number, compIdx: number, d0: number,
): number {
    const n = Math.max(2, Math.ceil(L / STEP));
    for (let i = 0; i <= n; i++) {
        const f = i / n;
        pts.push({ x: t.x + Math.cos(t.angle) * L * f, y: t.y + Math.sin(t.angle) * L * f, angulo: t.angle, distAcum: d0 + L * f, compIdx });
    }
    t.x += Math.cos(t.angle) * L;
    t.y += Math.sin(t.angle) * L;
    return L;
}

function addArco(
    pts: PuntoRuta[], t: Turtle,
    R: number, αDeg: number, dir: 1 | -1,
    compIdx: number, d0: number,
): number {
    const αRad  = αDeg * Math.PI / 180;
    const arcLen = R * αRad;
    const steps  = Math.max(8, Math.ceil(αDeg / 3));

    // Center is R units perpendicular to current heading.
    // dir=1 (right/CW in Phaser screen coords): center offset angle = turtle.angle + π/2
    const centerAng = t.angle + dir * Math.PI / 2;
    const cx = t.x + Math.cos(centerAng) * R;
    const cy = t.y + Math.sin(centerAng) * R;
    const fromCenter = Math.atan2(t.y - cy, t.x - cx);

    for (let i = 0; i <= steps; i++) {
        const f  = i / steps;
        const a  = fromCenter + dir * f * αRad;
        pts.push({
            x:        cx + Math.cos(a) * R,
            y:        cy + Math.sin(a) * R,
            angulo:   t.angle + dir * f * αRad,
            distAcum: d0 + arcLen * f,
            compIdx,
        });
    }
    t.x     = cx + Math.cos(fromCenter + dir * αRad) * R;
    t.y     = cy + Math.sin(fromCenter + dir * αRad) * R;
    t.angle = t.angle + dir * αRad;
    return arcLen;
}

// chicane = two arcs of equal angle in opposite directions (net heading Δ = 0)
function addChicane(
    pts: PuntoRuta[], t: Turtle,
    comp: ComponenteCircuito, compIdx: number, d0: number,
): number {
    const R     = comp.radio    ?? 20;
    const half  = comp.anguloDeg ?? 60; // degrees per each arc
    const dir   = (comp.dir ?? 1) as 1 | -1;
    let   dist  = 0;
    dist += addArco(pts, t, R, half,  dir,   compIdx, d0 + dist);
    dist += addArco(pts, t, R, half, -dir as 1 | -1, compIdx, d0 + dist);
    return dist;
}

// ── Sector name auto-generation ───────────────────────────────────────────────
function nombreDeSector(tipo: TipoComponente, counts: Record<string, number>): string {
    counts[tipo] = (counts[tipo] ?? 0) + 1;
    const n = counts[tipo];
    switch (tipo) {
        case 'recta':         return n === 1 ? 'Recta principal' : `Recta ${n}`;
        case 'curva_abierta': return `Curva ${n}`;
        case 'curva_cerrada': return `Curva cerrada ${n}`;
        case 'chicane':       return `Chicane ${n}`;
        case 'horquilla':     return `Horquilla ${n}`;
    }
}

// ── Auto-profile from sector composition ─────────────────────────────────────
function computarPerfil(sectores: Segmento[], def: CircuitoDef): PerfilCircuito {
    const totalLen = sectores.reduce((a, s) => a + s.longitudMetros, 0) || 1;

    const avg = sectores.reduce(
        (acc, seg) => {
            const w = seg.longitudMetros / totalLen;
            return {
                acceleration: acc.acceleration + seg.modificadores.acceleration * w,
                topSpeed:     acc.topSpeed     + seg.modificadores.topSpeed     * w,
                handling:     acc.handling     + seg.modificadores.handling     * w,
            };
        },
        { acceleration: 0, topSpeed: 0, handling: 0 },
    );

    const total = avg.acceleration + avg.topSpeed + avg.handling || 1;
    const pesoAcceleration = avg.acceleration / total;
    const pesoTopSpeed     = avg.topSpeed     / total;
    const pesoHandling     = avg.handling     / total;

    let arquetipoBeneficiado: ArquetipoRival;
    if (pesoTopSpeed >= pesoHandling && pesoTopSpeed >= pesoAcceleration) arquetipoBeneficiado = 'velocista';
    else if (pesoHandling >= pesoAcceleration)                            arquetipoBeneficiado = 'tecnico';
    else                                                                   arquetipoBeneficiado = 'resistente';

    return {
        pesoAcceleration,
        pesoTopSpeed,
        pesoHandling,
        arquetipoBeneficiado: def.perfil.arquetipoBeneficiado ?? arquetipoBeneficiado,
        arquetipoPerjudicado: def.perfil.arquetipoPerjudicado ??
            (arquetipoBeneficiado === 'velocista' ? 'tecnico' : 'velocista'),
    };
}

// ── Scale path to fit canvas area ────────────────────────────────────────────
function scalePath(pts: PuntoRuta[]): void {
    if (pts.length < 2) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }

    const rawW  = maxX - minX || 1;
    const rawH  = maxY - minY || 1;
    const scale = Math.min(CIRCUIT_AREA.w / rawW, CIRCUIT_AREA.h / rawH) * 0.88;

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const tx = CIRCUIT_AREA.x + CIRCUIT_AREA.w / 2;
    const ty = CIRCUIT_AREA.y + CIRCUIT_AREA.h / 2;

    for (const p of pts) {
        p.x = tx + (p.x - cx) * scale;
        p.y = ty + (p.y - cy) * scale;
    }
}

// ── Main builder ─────────────────────────────────────────────────────────────
export function buildCircuito(def: CircuitoDef): CircuitoComputado {
    const turtle: Turtle      = { x: 0, y: 0, angle: 0 };
    const rawPts: PuntoRuta[] = [];
    const sectores: Segmento[]  = [];
    const fracInicio: number[]  = [];
    const counts: Record<string, number> = {};

    let distAcum = 0;

    def.componentes.forEach((comp, idx) => {
        fracInicio.push(distAcum);

        const mod      = modificadoresDeComponente(comp);
        const refSpeed = def.vehiculoReferencia.velocidadPromedioKmh;
        const nombre   = nombreDeSector(comp.tipo, counts);

        let longitud: number;
        let added: number;

        switch (comp.tipo) {
            case 'recta':
                longitud = comp.longitud ?? 200;
                added    = addRecta(rawPts, turtle, longitud, idx, distAcum);
                break;
            case 'curva_abierta':
            case 'curva_cerrada': {
                const R   = comp.radio    ?? RADIO_REF;
                const deg = comp.anguloDeg ?? (comp.tipo === 'curva_abierta' ? 90 : 180);
                const dir = (comp.dir ?? 1) as 1 | -1;
                longitud  = R * deg * Math.PI / 180;
                added     = addArco(rawPts, turtle, R, deg, dir, idx, distAcum);
                break;
            }
            case 'horquilla': {
                const R  = comp.radio ?? 18;
                const dir = (comp.dir ?? 1) as 1 | -1;
                longitud = R * Math.PI;
                added    = addArco(rawPts, turtle, R, 180, dir, idx, distAcum);
                break;
            }
            case 'chicane': {
                const R    = comp.radio    ?? 20;
                const half = comp.anguloDeg ?? 60;
                longitud   = R * half * Math.PI / 180 * 2;
                added      = addChicane(rawPts, turtle, comp, idx, distAcum);
                break;
            }
        }

        distAcum += added!;

        sectores.push({
            id:                  `S${idx + 1}`,
            nombre,
            tipo:                comp.tipo === 'recta' ? 'recta' : 'curva',
            longitudMetros:      Math.round(longitud!),
            velocidadEntradaKmh: Math.round(refSpeed * mod.topSpeed * 0.85),
            velocidadPuntaKmh:   Math.round(refSpeed * mod.topSpeed),
            velocidadSalidaKmh:  Math.round(refSpeed * mod.topSpeed * 0.85),
            marcha:              clamp(Math.round(mod.topSpeed * 5), 1, 6),
            tiempoEstimadoSeg:   Math.round(longitud! / (refSpeed / 3.6)),
            modificadores:       mod,
        });
    });

    // Close the path back to origin for a seamless loop
    if (rawPts.length > 0) {
        const first = rawPts[0];
        rawPts.push({ x: first.x, y: first.y, angulo: first.angulo, distAcum, compIdx: 0 });
    }

    const longitudTotal = distAcum;

    // Scale positions to canvas and normalize distAcum → [0, 1]
    const pts = rawPts.map(p => ({ ...p, distAcum: p.distAcum / longitudTotal }));
    scalePath(pts);

    const fracComienzo = fracInicio.map(d => d / longitudTotal);
    const perfil       = computarPerfil(sectores, def);

    return {
        id:                 def.id,
        nombre:             def.nombre,
        tipo:               def.tipo,
        tipoSuperficie:     def.tipoSuperficie,
        vehiculoReferencia: def.vehiculoReferencia,
        sectores,
        perfil,
        clima:              def.clima,
        puntos:             pts,
        fracComienzo,
        longitudTotal,
    };
}

// ── Position interpolation along circuit ─────────────────────────────────────
export function calcularPos(
    t: number,
    puntos: PuntoRuta[],
): { x: number; y: number; angulo: number } {
    const n = puntos.length;
    if (n === 0) return { x: 0, y: 0, angulo: 0 };
    if (n === 1) return { x: puntos[0].x, y: puntos[0].y, angulo: puntos[0].angulo };

    const tc = ((t % 1) + 1) % 1; // ensure [0,1)

    let lo = 0, hi = n - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (puntos[mid].distAcum <= tc) lo = mid; else hi = mid;
    }

    const p1   = puntos[lo];
    const p2   = puntos[Math.min(hi, n - 1)];
    const span = p2.distAcum - p1.distAcum;
    const f    = span > 0 ? (tc - p1.distAcum) / span : 0;

    return {
        x:      p1.x + (p2.x - p1.x) * f,
        y:      p1.y + (p2.y - p1.y) * f,
        angulo: p1.angulo + (p2.angulo - p1.angulo) * f,
    };
}

// ── Circuit registry ──────────────────────────────────────────────────────────
const cache = new Map<string, CircuitoComputado>();

export function getCircuito(id: string): CircuitoComputado {
    if (cache.has(id)) return cache.get(id)!;
    const def = (circuitosData as CircuitoDef[]).find(c => c.id === id);
    if (!def) throw new Error(`Circuito "${id}" no encontrado`);
    const built = buildCircuito(def);
    cache.set(id, built);
    return built;
}

export function listarCircuitos(): { id: string; nombre: string }[] {
    return (circuitosData as CircuitoDef[]).map(c => ({ id: c.id, nombre: c.nombre }));
}
