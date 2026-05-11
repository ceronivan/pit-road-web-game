import type {
    StatsCarro, EstadoCarrera, EstadoClimatico,
    ResultadoVuelta, ResultadoCarrera, Rival,
    CategoriaPieza, Pieza, CircuitoComputado, Segmento,
    ModificadoresSegmento
} from '../types';

// ─── Pesos de contribución: categoría → variable maestra ─────────────────────
const PESOS: Record<CategoriaPieza, Partial<Record<keyof StatsCarro, number>>> = {
    motor:        { acceleration: 0.45, topSpeed: 0.40, handling: 0.00 },
    transmision:  { acceleration: 0.30, topSpeed: 0.30, handling: 0.05 },
    aerodinamica: { acceleration: 0.00, topSpeed: 0.20, handling: 0.25 },
    suspension:   { acceleration: 0.05, topSpeed: 0.00, handling: 0.40 },
    llantas:      { acceleration: 0.15, topSpeed: 0.05, handling: 0.25 },
    electronica:  { acceleration: 0.05, topSpeed: 0.05, handling: 0.05 },
};

const PUNTOS_POR_POSICION = [15, 12, 10, 7, 4, 1];

const CLIMA_FALLBACK: Record<EstadoClimatico, keyof CircuitoComputado['clima']> = {
    despejado: 'despejado',
    nublado:   'despejado',
    lluvia:    'lluvia',
    nieve:     'nieve',
    tormenta:  'tormenta',
    polvo:     'lluvia',
};

// ─── Trade-offs: ningún carro puede ser perfecto ──────────────────────────────
export function aplicarTradeoffs(stats: StatsCarro): StatsCarro {
    const penaltyAccelToHandling = Math.max(0, (stats.acceleration - 70) * 0.40);
    const penaltySpeedToAccel    = Math.max(0, (stats.topSpeed     - 70) * 0.30);
    const penaltyHandlingToSpeed = Math.max(0, (stats.handling     - 70) * 0.35);

    return {
        acceleration: Math.min(100, Math.max(0, stats.acceleration - penaltySpeedToAccel)),
        topSpeed:     Math.min(100, Math.max(0, stats.topSpeed     - penaltyHandlingToSpeed)),
        handling:     Math.min(100, Math.max(0, stats.handling     - penaltyAccelToHandling)),
    };
}

// ─── Calcula stats del carro desde piezas equipadas ──────────────────────────
export function calcularStatsCarro(piezas: Partial<Record<CategoriaPieza, Pieza>>): StatsCarro {
    const raw: StatsCarro = { acceleration: 0, topSpeed: 0, handling: 0 };

    for (const [categoria, pieza] of Object.entries(piezas) as [CategoriaPieza, Pieza][]) {
        if (!pieza) continue;
        const pesos = PESOS[categoria];
        const s     = pieza.stats;
        raw.acceleration += (s.acceleration ?? 0) * 10 * (pesos.acceleration ?? 0);
        raw.topSpeed     += (s.topSpeed     ?? 0) * 10 * (pesos.topSpeed     ?? 0);
        raw.handling     += (s.handling     ?? 0) * 10 * (pesos.handling     ?? 0);
    }

    const BASE = 60;
    const normalizado: StatsCarro = {
        acceleration: Math.min(100, Math.round((raw.acceleration / BASE) * 100)),
        topSpeed:     Math.min(100, Math.round((raw.topSpeed     / BASE) * 100)),
        handling:     Math.min(100, Math.round((raw.handling     / BASE) * 100)),
    };
    return aplicarTradeoffs(normalizado);
}

// ─── Rendimiento teórico en un segmento (sin error humano) ────────────────────
export function calcularRendimientoEnSegmento(
    stats: StatsCarro,
    segmento: Segmento,
    clima: EstadoClimatico,
    circuito: CircuitoComputado
): number {
    const mod: ModificadoresSegmento      = segmento.modificadores;
    const climaMod: ModificadoresSegmento = circuito.clima[CLIMA_FALLBACK[clima]];

    const accel = stats.acceleration * mod.acceleration * climaMod.acceleration;
    const speed = stats.topSpeed     * mod.topSpeed     * climaMod.topSpeed;
    const hand  = stats.handling     * mod.handling     * climaMod.handling;

    return Math.min(100, Math.max(0,
        accel * circuito.perfil.pesoAcceleration +
        speed * circuito.perfil.pesoTopSpeed     +
        hand  * circuito.perfil.pesoHandling
    ));
}

// ─── Rendimiento teórico de vuelta completa — usado en TallerScene ────────────
export function calcularRendimientoVuelta(
    stats: StatsCarro,
    clima: EstadoClimatico,
    circuito: CircuitoComputado
): number {
    const rendimientos = circuito.sectores.map(seg =>
        calcularRendimientoEnSegmento(stats, seg, clima, circuito)
    );
    return rendimientos.reduce((a, b) => a + b, 0) / rendimientos.length;
}

// ─── Rendimiento base (sin circuito) — usado en TallerScene ──────────────────
export function calcularRendimiento(stats: StatsCarro): number {
    return (
        stats.acceleration * 0.35 +
        stats.topSpeed     * 0.35 +
        stats.handling     * 0.30
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODELO DE EJECUCIÓN HUMANA — línea de carrera con margen de error
// ═══════════════════════════════════════════════════════════════════════════════

// Distribución gaussiana aproximada por el teorema del límite central (n=6).
// Sigma=1 → 68% de valores en [-1, +1], 95% en [-2, +2].
function gauss(sigma: number): number {
    let s = 0;
    for (let i = 0; i < 6; i++) s += Math.random() - 0.5;
    return (s / 0.707) * sigma; // 0.707 ≈ std de la suma de 6 uniformes [-0.5, 0.5]
}

// Calcula la desviación estándar (σ) del error de ejecución para un segmento.
// Factores: tipo de segmento, stats relevantes, clima, desgaste de llantas.
function sigmaEjecucion(
    stats: StatsCarro,
    seg: Segmento,
    clima: EstadoClimatico,
    circuito: CircuitoComputado,
    desgaste: number,
): number {
    const climaMod = circuito.clima[CLIMA_FALLBACK[clima]];

    let sigmaBase: number;
    let statClave: number; // el stat más relevante para este tipo de segmento

    if (seg.tipo === 'recta') {
        // Rectas: el error principal viene del punto de frenada (acceleration)
        sigmaBase = 2.2;
        statClave = stats.acceleration;
        // Rectas rápidas (topSpeed mod > 1) amplifican el error de frenada
        sigmaBase *= (0.65 + seg.modificadores.topSpeed * 0.45);
        // Lluvia/nieve dificultan la frenada enormemente
        sigmaBase *= (2.0 - climaMod.acceleration);
    } else {
        // Curvas: 3 fuentes de error — frenada, apex, salida
        sigmaBase = 4.8;
        // Handling domina el apex y trail-braking; acceleration domina la salida
        statClave = stats.handling * 0.60 + stats.acceleration * 0.40;
        // Curvas cerradas (topSpeed mod bajo) tienen más margen para error
        sigmaBase *= Math.max(1.0, 2.3 - seg.modificadores.topSpeed);
        sigmaBase  = Math.min(sigmaBase, 12.0);
        // El clima tiene impacto enorme en el grip lateral
        sigmaBase *= (2.0 - climaMod.handling);
    }

    // Mejor stat → ejecución más consistente → σ menor
    // stat=100 → factor=1.0 (mínimo), stat=0 → factor=1.8 (máximo ruido)
    const factorHabilidad = 1.0 + (1.0 - statClave / 100) * 0.80;

    // Desgaste de llantas → menor agarre → más varianza (especialmente en curvas)
    const factorDesgaste = 1.0 + (desgaste / 100) * (seg.tipo === 'curva' ? 0.60 : 0.18);

    return Math.min(14.0, Math.max(1.2, sigmaBase * factorHabilidad * factorDesgaste));
}

// Modela la línea de carrera en fases según el diagrama (frenada→apex→salida).
// Devuelve el rendimiento real ejecutado (con errores humanos aplicados).
// calidadVuelta: factor global de la vuelta (buena/mala vuelta del piloto).
function ejecutarSegmento(
    stats: StatsCarro,
    seg: Segmento,
    clima: EstadoClimatico,
    circuito: CircuitoComputado,
    desgaste: number,
    calidadVuelta: number,
): number {
    const base  = calcularRendimientoEnSegmento(stats, seg, clima, circuito);
    const sigma = sigmaEjecucion(stats, seg, clima, circuito, desgaste);

    let errorEjecucion: number;

    if (seg.tipo === 'curva') {
        // ── Fase 1: Frenada / Braking zone ────────────────────────────────────
        // acceleration define qué tan tarde se puede frenar y con qué precisión.
        // Un error en frenada arruina las fases siguientes (carry-over del 35%).
        const eFreno = gauss(sigma * 0.40);

        // ── Fase 2: Apex / Neutral balance / Trail braking ────────────────────
        // handling define si el piloto sigue la línea ideal al vértice.
        // El error de frenada se arrastra parcialmente (no puedes corregir del todo).
        const carryover = eFreno * 0.35;
        const eApex = gauss(sigma * 0.35) + carryover;

        // ── Fase 3: Transición + Aceleración de salida ────────────────────────
        // acceleration + handling juntos determinan cuándo se puede pisar el gas.
        const eSalida = gauss(sigma * 0.28);

        // Peso de cada fase: frenada y apex son más críticas que la salida
        errorEjecucion = eFreno * 0.35 + eApex * 0.40 + eSalida * 0.25;
    } else {
        // ── Recta: velocidad de entrada + punta + frenada al final ────────────
        // La velocidad de entrada depende de qué tan bien se ejecutó la curva anterior.
        const eEntrada = gauss(sigma * 0.50);
        const eVelMax  = gauss(sigma * 0.20);
        errorEjecucion = eEntrada * 0.60 + eVelMax * 0.40;
    }

    // Bias negativo: los pilotos rara vez alcanzan el máximo teórico
    const sesgo = -sigma * 0.10;

    // calidadVuelta pondera el error global de la vuelta en este segmento
    const rendimiento = base + errorEjecucion * (1.0 + calidadVuelta * 0.3) + sesgo;
    return Math.min(100, Math.max(0, rendimiento));
}

// Simula una vuelta completa con ejecución humana realista.
function simularEjecucionVuelta(
    stats: StatsCarro,
    clima: EstadoClimatico,
    circuito: CircuitoComputado,
    desgaste: number,
): number {
    // Una vuelta tiene un factor de calidad global (buena o mala vuelta del piloto).
    // Sigma=2.5 → la mayoría de vueltas ±2.5 puntos respecto al promedio del piloto.
    const calidadVuelta = gauss(2.5);

    const ejecuciones = circuito.sectores.map(seg =>
        ejecutarSegmento(stats, seg, clima, circuito, desgaste, calidadVuelta)
    );
    return ejecuciones.reduce((a, b) => a + b, 0) / ejecuciones.length;
}

// ─── Simula una vuelta usando el circuito activo ──────────────────────────────
export function simularVuelta(
    estado: EstadoCarrera,
    statsJugador: StatsCarro,
    rivales: Rival[],
    circuito: CircuitoComputado
): ResultadoVuelta {
    const factorDesgaste = 1 - (estado.desgasteLlantas / 200);
    const factorCalor    = 1 - (Math.max(0, estado.calorMotor - 70) / 100);

    // Jugador: ejecución con error humano real en cada fase de la curva
    const rendimiento = simularEjecucionVuelta(
        statsJugador, estado.clima, circuito, estado.desgasteLlantas,
    ) * factorDesgaste * factorCalor;

    // Rivales: mismo modelo de ejecución, con desgaste de llantas variado
    // (cada rival está en una etapa distinta de su estrategia de pits)
    const rendimientosRivales = rivales.map(r => {
        const desgasteRival = 8 + Math.random() * 35;
        return simularEjecucionVuelta(r.stats, estado.clima, circuito, desgasteRival);
    });

    const posicion = rendimientosRivales.filter(r => r > rendimiento).length + 1;

    // Desgaste y calor: curvas aumentan el desgaste de llantas más que las rectas
    const fracCurvas = circuito.sectores.filter(s => s.tipo === 'curva').length
                     / Math.max(1, circuito.sectores.length);
    const desgasteExtra = fracCurvas * 1.5;

    return {
        rendimiento,
        posicion,
        desgasteLlantas:   Math.min(100, estado.desgasteLlantas  + (2.5 + Math.random() * 2   + desgasteExtra)),
        calorMotor:        Math.min(100, estado.calorMotor        + (2   + Math.random() * 3)),
        combustible:       Math.max(0,   estado.combustible       - (4   + Math.random() * 1)),
        durabilidadActual: Math.max(0,   estado.durabilidadActual - (1   + Math.random() * 1.5)),
    };
}

// ─── Pit stop ─────────────────────────────────────────────────────────────────
export function aplicarPitStop(estado: EstadoCarrera): EstadoCarrera {
    return {
        ...estado,
        desgasteLlantas: 5,
        calorMotor:      Math.max(30, estado.calorMotor - 40),
        posicion:        Math.min(6, estado.posicion + 3),
        enPitStop:       false,
    };
}

// ─── Puntos y resultado final ─────────────────────────────────────────────────
export function calcularPuntosFinales(posicion: number): number {
    return PUNTOS_POR_POSICION[posicion - 1] ?? 0;
}

export function construirResultado(estado: EstadoCarrera): ResultadoCarrera {
    return {
        posicionFinal:      estado.posicion,
        vueltasCompletadas: estado.vueltaActual,
        danoRecibido:       Math.round(100 - estado.durabilidadActual),
        puntosObtenidos:    calcularPuntosFinales(estado.posicion),
        abandono:           estado.combustible <= 0 || estado.durabilidadActual <= 0,
    };
}
