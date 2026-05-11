// ── Circuit Editor — entry point (Fase 1) ────────────────────────────────────
// Tarea 1.3: renderizar OVAL de ejemplo y verificar visualmente.
// Tarea 1.4: control de tileSize para hacer las celdas redimensionables.

import { TILES, getBezierPath, COLORS } from './tiles';
import { renderCircuit, type Grid } from './CircuitRenderer';

// ── Circuitos de referencia (spec §6) ─────────────────────────────────────────

const OVAL: Grid = [
    ['C-SE', 'ST-H', 'ST-H', 'WC-SW',  null   ],
    ['ST-V',  null,   null,  'ST-V',   'HP-N'  ],
    ['C-NE', 'ST-H', 'ST-H', 'WC-NW',  null   ],
];

const F1_LAYOUT: Grid = [
    [ null,   'C-SE', 'ST-H', 'ST-H', 'ST-H', 'C-SW',  null  ],
    [ null,   'ST-V',  null,   null,   null,   'ST-V',  null  ],
    ['C-SE', 'C-NW', 'C-SE', 'ST-H', 'C-SW', 'C-NE', 'C-SW' ],
    ['ST-V',  null,  'ST-V',  null,  'ST-V',  null,   'ST-V' ],
    ['C-NE', 'ST-H', 'C-NW',  null,  'C-NE', 'ST-H',  'HP-N'],
];

const CIRCUITS: { name: string; grid: Grid }[] = [
    { name: 'Óvalo simple',   grid: OVAL       },
    { name: 'Layout tipo F1', grid: F1_LAYOUT  },
];

// ── Estado de la app ──────────────────────────────────────────────────────────
let tileSize = 80;

// ── Render helpers ────────────────────────────────────────────────────────────

function renderCatalog(container: HTMLElement, S: number): void {
    container.innerHTML = '';

    for (const [id, tile] of Object.entries(TILES)) {
        const card = document.createElement('div');
        card.className = 'tile-card';

        // Mini SVG del tile
        const SVG_NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('width',   String(S));
        svg.setAttribute('height',  String(S));
        svg.setAttribute('viewBox', `0 0 ${S} ${S}`);

        const bg = document.createElementNS(SVG_NS, 'rect');
        bg.setAttribute('width',  String(S));
        bg.setAttribute('height', String(S));
        bg.setAttribute('fill',   COLORS.grass);
        svg.appendChild(bg);

        const path = getBezierPath(
            tile.from, tile.to, S,
            tile.curveType ?? 'tight',
            tile.special   ?? null,
        );
        const sw = S * 0.33;

        const mkPath = (stroke: string, width: number, extra: Record<string,string> = {}) => {
            const p = document.createElementNS(SVG_NS, 'path');
            p.setAttribute('d', path);
            p.setAttribute('fill', 'none');
            p.setAttribute('stroke', stroke);
            p.setAttribute('stroke-width', String(width));
            p.setAttribute('stroke-linecap', 'round');
            for (const [k, v] of Object.entries(extra)) p.setAttribute(k, v);
            return p;
        };

        svg.appendChild(mkPath(COLORS.shadow, sw + 4, { opacity: '0.4' }));
        svg.appendChild(mkPath(COLORS.asphDk, sw + 2));
        svg.appendChild(mkPath(COLORS.asph,   sw));
        svg.appendChild(mkPath(COLORS.dash, Math.max(1, S * 0.025), {
            'stroke-dasharray': `${S * 0.1} ${S * 0.06}`,
        }));

        card.appendChild(svg);

        const label = document.createElement('div');
        label.className = 'tile-label';
        label.innerHTML = `<strong>${id}</strong><br>${tile.label ?? ''}`;
        card.appendChild(label);

        container.appendChild(card);
    }
}

function renderAll(): void {
    // Circuitos
    const circuitsEl = document.getElementById('circuits')!;
    circuitsEl.innerHTML = '';

    for (const { name, grid } of CIRCUITS) {
        const section = document.createElement('section');
        section.className = 'circuit-section';

        const title = document.createElement('h2');
        title.textContent = name;
        section.appendChild(title);

        const svg = renderCircuit(grid, tileSize);
        section.appendChild(svg);
        circuitsEl.appendChild(section);
    }

    // Catálogo
    const catalogEl = document.getElementById('catalog')!;
    renderCatalog(catalogEl, Math.max(60, Math.min(tileSize, 100)));
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init(): void {
    // Control de tileSize (tarea 1.4)
    const slider  = document.getElementById('tile-size-slider') as HTMLInputElement;
    const sizeVal = document.getElementById('tile-size-value')!;

    slider.value = String(tileSize);
    sizeVal.textContent = `${tileSize}px`;

    slider.addEventListener('input', () => {
        tileSize = Number(slider.value);
        sizeVal.textContent = `${tileSize}px`;
        renderAll();
    });

    renderAll();
}

document.addEventListener('DOMContentLoaded', init);
