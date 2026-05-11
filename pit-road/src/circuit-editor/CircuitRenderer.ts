// ── CircuitRenderer — renderizado SVG vanilla (sin framework) ────────────────
// Equivalente a los componentes TileRenderer / CircuitRenderer del spec §4.
// Cada función retorna un elemento SVG listo para insertarse en el DOM.

import { TILES, getBezierPath, COLORS, type TileDef } from './tiles';

// ── Constantes visuales por defecto ──────────────────────────────────────────
export const DEFAULT_TILE_SIZE = 80;
const TRACK_RATIO = 0.33;    // ancho de track = 33% del tile

// ── Grid: array 2-D de IDs de tiles o null (celda vacía) ─────────────────────
export type Grid = (string | null)[][];

// ── SVG namespace ─────────────────────────────────────────────────────────────
const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
    return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

function setAttrs(node: Element, attrs: Record<string, string | number>): void {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
}

// ── renderTile ────────────────────────────────────────────────────────────────
// Equivalente a <TileRenderer> del spec §4.
// Retorna un <g> posicionado en (0,0); aplica translate exterior para colocarlo.
//
// @param tileId   - clave en TILES (ej. "C-NE", "HP-S")
// @param tileSize - tamaño del tile en px (prop equivalente al spec §7 tarea 1.4)
export function renderTile(tileId: string, tileSize: number = DEFAULT_TILE_SIZE): SVGGElement {
    const tile: TileDef = TILES[tileId];
    const S  = tileSize;
    const sw = S * TRACK_RATIO;

    const g = el('g');

    // Fondo (grass)
    const bg = el('rect');
    setAttrs(bg, { width: S, height: S, fill: COLORS.grass });
    g.appendChild(bg);

    const d = getBezierPath(
        tile.from, tile.to, S,
        tile.curveType ?? 'tight',
        tile.special   ?? null,
    );

    // Sombra del track
    const shadow = el('path');
    setAttrs(shadow, {
        d, fill: 'none', stroke: COLORS.shadow,
        'stroke-width': sw + 4, 'stroke-linecap': 'round', opacity: 0.4,
    });
    g.appendChild(shadow);

    // Borde del track
    const border = el('path');
    setAttrs(border, {
        d, fill: 'none', stroke: COLORS.asphDk,
        'stroke-width': sw + 2, 'stroke-linecap': 'round',
    });
    g.appendChild(border);

    // Superficie de asfalto
    const asph = el('path');
    setAttrs(asph, {
        d, fill: 'none', stroke: COLORS.asph,
        'stroke-width': sw, 'stroke-linecap': 'round',
    });
    g.appendChild(asph);

    // Línea central punteada
    const dash = el('path');
    setAttrs(dash, {
        d, fill: 'none', stroke: COLORS.dash,
        'stroke-width': Math.max(1, S * 0.025),
        'stroke-linecap': 'round',
        'stroke-dasharray': `${S * 0.1} ${S * 0.06}`,
    });
    g.appendChild(dash);

    return g;
}

// ── renderCircuit ─────────────────────────────────────────────────────────────
// Equivalente a <CircuitRenderer> del spec §4.
// Retorna un <svg> completo con el grid renderizado.
//
// @param grid     - matriz 2-D de IDs de tiles (null = celda vacía)
// @param tileSize - tamaño de celda en px (tarea 1.4: prop configurable)
export function renderCircuit(grid: Grid, tileSize: number = DEFAULT_TILE_SIZE): SVGSVGElement {
    const S    = tileSize;
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;

    const svg = el('svg');
    setAttrs(svg, {
        width:   cols * S,
        height:  rows * S,
        viewBox: `0 0 ${cols * S} ${rows * S}`,
    });

    for (let ri = 0; ri < rows; ri++) {
        for (let ci = 0; ci < cols; ci++) {
            const tileId = grid[ri][ci];

            if (tileId && TILES[tileId]) {
                const tileEl = renderTile(tileId, S);
                tileEl.setAttribute('transform', `translate(${ci * S},${ri * S})`);
                svg.appendChild(tileEl);
            } else {
                // Celda vacía → solo fondo (grass)
                const empty = el('rect');
                setAttrs(empty, {
                    x: ci * S, y: ri * S, width: S, height: S, fill: COLORS.grass,
                });
                svg.appendChild(empty);
            }
        }
    }

    return svg;
}
