// ── Tile system — lógica y geometría ─────────────────────────────────────────
// Spec: docs/racing-circuit-spec.md  §2, §3

export type Dir        = 'N' | 'S' | 'E' | 'W';
export type CurveType  = 'tight' | 'wide';
export type Special    = 'hp-n' | 'hp-s' | 'hp-e' | 'hp-w' | null;

export interface TileDef {
    from:       Dir;
    to:         Dir;
    curveType?: CurveType;   // defaults to 'tight'
    special?:   Special;     // hairpin variant
    label?:     string;      // human-readable name (UI)
}

// ── §2.2 — Catálogo canónico de tiles ─────────────────────────────────────────
export const TILES: Record<string, TileDef> = {

    // Rectas ──────────────────────────────────────────────────────────────────
    'ST-H': { from: 'W', to: 'E',                        label: 'Recta horizontal'   },
    'ST-V': { from: 'N', to: 'S',                        label: 'Recta vertical'     },

    // Curvas cerradas 90° ─────────────────────────────────────────────────────
    'C-NE': { from: 'N', to: 'E',                        label: 'Curva NE (cerrada)' },
    'C-NW': { from: 'N', to: 'W',                        label: 'Curva NO (cerrada)' },
    'C-SE': { from: 'S', to: 'E',                        label: 'Curva SE (cerrada)' },
    'C-SW': { from: 'S', to: 'W',                        label: 'Curva SO (cerrada)' },

    // Curvas abiertas (radio amplio, tramos rápidos) ──────────────────────────
    'WC-NE': { from: 'N', to: 'E', curveType: 'wide',   label: 'Curva NE (abierta)' },
    'WC-NW': { from: 'N', to: 'W', curveType: 'wide',   label: 'Curva NO (abierta)' },
    'WC-SE': { from: 'S', to: 'E', curveType: 'wide',   label: 'Curva SE (abierta)' },
    'WC-SW': { from: 'S', to: 'W', curveType: 'wide',   label: 'Curva SO (abierta)' },

    // Horquillas (U-turns) ────────────────────────────────────────────────────
    'HP-S': { from: 'W', to: 'E', special: 'hp-s',      label: 'Horquilla (↑ norte)' },
    'HP-N': { from: 'W', to: 'E', special: 'hp-n',      label: 'Horquilla (↓ sur)'   },
    'HP-E': { from: 'N', to: 'S', special: 'hp-e',      label: 'Horquilla (← oeste)' },
    'HP-W': { from: 'N', to: 'S', special: 'hp-w',      label: 'Horquilla (→ este)'  },
};

// ── §3 — getBezierPath ────────────────────────────────────────────────────────
// Genera el SVG path del centerline de un tile.
// Copiada literalmente del spec; no modificar la geometría.
//
// BUG CONOCIDO EVITADO: espacio obligatorio en `Q${cpx},${cpy} ${x2},${y2}`
// (sin espacio, SVG concatena los números y el path es inválido).
export function getBezierPath(
    from:      Dir,
    to:        Dir,
    S:         number,
    curveType: CurveType = 'tight',
    special:   Special   = null,
): string {
    const cx = S / 2, cy = S / 2;
    const pts: Record<Dir, [number, number]> = {
        N: [cx, 0 ],
        S: [cx, S ],
        W: [0,  cy],
        E: [S,  cy],
    };
    const [x1, y1] = pts[from];
    const [x2, y2] = pts[to];

    // ① Rectas
    const isStraight =
        (from === 'N' && to === 'S') || (from === 'S' && to === 'N') ||
        (from === 'W' && to === 'E') || (from === 'E' && to === 'W');
    if (isStraight) return `M${x1},${y1} L${x2},${y2}`;

    // ② Horquillas (U-turns): brazos rectos + arco SVG
    if (special === 'hp-s') {
        const r = S * 0.28;
        return `M${x1},${y1} L${cx - r},${cy} A${r},${r} 0 0,1 ${cx + r},${cy} L${x2},${y2}`;
    }
    if (special === 'hp-n') {
        const r = S * 0.28;
        return `M${x1},${y1} L${cx - r},${cy} A${r},${r} 0 0,0 ${cx + r},${cy} L${x2},${y2}`;
    }
    if (special === 'hp-e') {
        const r = S * 0.28;
        return `M${x1},${y1} L${cx},${cy - r} A${r},${r} 0 0,1 ${cx},${cy + r} L${x2},${y2}`;
    }
    if (special === 'hp-w') {
        const r = S * 0.28;
        return `M${x1},${y1} L${cx},${cy - r} A${r},${r} 0 0,0 ${cx},${cy + r} L${x2},${y2}`;
    }

    // ③ Curvas: bézier cuadrático
    // tight → control en el centro (cx, cy) → curva cerrada
    // wide  → control en la esquina exterior → curva suave/abierta
    let cpx = cx, cpy = cy;
    if (curveType === 'wide') {
        const e = [from, to];
        cpx = e.includes('E') ? S : e.includes('W') ? 0  : cx;
        cpy = e.includes('N') ? 0 : e.includes('S') ? S  : cy;
    }
    return `M${x1},${y1} Q${cpx},${cpy} ${x2},${y2}`; // ← espacio crítico antes de ${x2}
}

// ── §2.3 — Regla de compatibilidad entre tiles adyacentes ─────────────────────
// Verifica si tileA (en dirección dirA) puede conectar con tileB.
// "ambos conectan por ese borde, o ninguno conecta"
export function canConnect(
    tileA: TileDef,
    dirA:  Dir,
    tileB: TileDef,
): boolean {
    const opposite: Record<Dir, Dir> = { N: 'S', S: 'N', W: 'E', E: 'W' };
    const dirB      = opposite[dirA];
    const aConnects = [tileA.from, tileA.to].includes(dirA);
    const bConnects = [tileB.from, tileB.to].includes(dirB);
    return aConnects === bConnects;
}

// ── Colores canónicos (spec §9) ───────────────────────────────────────────────
export const COLORS = {
    grass:  '#0f2318',
    asphDk: '#2a2e3a',
    asph:   '#555a6a',
    dash:   '#a0a8b8',
    shadow: '#000000',
} as const;
