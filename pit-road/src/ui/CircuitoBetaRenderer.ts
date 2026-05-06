import type { Scene, GameObjects } from 'phaser';

// ── Tile grid constants ────────────────────────────────────────────────────────
// The track is laid out on an 80×80 px grid whose top edge aligns with the
// game header (GRID_Y0 = 44 = HEADER_H in CarreraScene).
// Grid intersection (col, row) → pixel ( col*TILE , GRID_Y0 + row*TILE )
export const TILE    = 80;
export const GRID_Y0 = 44;
const GRID_COLS      = 12;
const GRID_ROWS      = 5;

// Shorthand helper: grid (col, row) → absolute pixel [x, y]
const G = (col: number, row: number): [number, number] =>
    [col * TILE, GRID_Y0 + row * TILE];

// ── Track centerline waypoints (snapped to grid intersections) ─────────────────
//
//  col:   0   1   2   3   4   5   6   7   8   9  10  11
//  row 0:         ·───────────·   ·───────────·
//  row 1:     ·               ·───·           ·   ·
//  row 2:     |               ·───·               |
//  row 3:     |   ·                               |
//  row 4:    [S]──·───────────────────────────·───·
//
//  Sectors (clockwise):
//    S1 (green)  – left main straight (↑) + top-left hairpin + top entry
//    S2 (blue)   – technical S-bend chicane in centre
//    S3 (red)    – right fast section (top-right → bottom-right)
//    S4 (yellow) – bottom return + bottom-left hairpin
//
const PTS: readonly [number, number][] = [
    G( 1, 4),  //  0 — START / FINISH  (bottom-left)
    G( 1, 1),  //  1 — top of main straight
    G( 2, 0),  //  2 — top-left hairpin
    G( 5, 0),  //  3 — top straight (before technical)
    G( 6, 1),  //  4 ← S2 starts — technical entry (down)
    G( 6, 2),  //  5 — S-bend bottom-left
    G( 7, 2),  //  6 — S-bend bottom-right
    G( 7, 1),  //  7 — S-bend back up
    G( 8, 0),  //  8 — rejoin top straight
    G(10, 0),  //  9 ← S3 starts — top-right entry
    G(11, 1),  // 10 — right side entry
    G(11, 3),  // 11 — right side down
    G(10, 4),  // 12 — bottom-right corner
    G( 8, 4),  // 13 ← S4 starts — bottom return straight
    G( 4, 4),  // 14 — bottom straight mid
    G( 2, 3),  // 15 — bottom-left hairpin
    //  → segment 15 → 0 closes the loop back to G(1,4)
];

// First point index of each sector boundary
const S2_IDX = 4;
const S3_IDX = 9;
const S4_IDX = 13;

// Track width — same as CircuitoRenderer for consistent proportions
const TW   = 28;
const FONT = "'Open Sans', sans-serif";

// ── Corner rounding ────────────────────────────────────────────────────────────
// How many px to cut from each side of a waypoint corner for the bezier curve
const CORNER_RADIUS = 28;

// ── Sector waypoint sub-paths (open polylines, endpoints = sector boundaries) ─
const SECTOR_PTS: Record<string, [number, number][]> = {
    S1: [PTS[0],  PTS[1],  PTS[2],  PTS[3],  PTS[4]],
    S2: [PTS[4],  PTS[5],  PTS[6],  PTS[7],  PTS[8],  PTS[9]],
    S3: [PTS[9],  PTS[10], PTS[11], PTS[12], PTS[13]],
    S4: [PTS[13], PTS[14], PTS[15], PTS[0]],
};

export const SECTOR_COLOR_BETA: Record<string, number> = {
    S1: 0x50c860,
    S2: 0x5070e0,
    S3: 0xe06040,
    S4: 0xe0b040,
};

export const BAND_PLAYER_BETA =  9;   // late-apex / outer-entry line
export const BAND_RIVAL_BETA  = -4;   // inner / defensive line

// ── Internal segment ──────────────────────────────────────────────────────────
interface Seg {
    x1: number; y1: number;
    x2: number; y2: number;
    len:    number;   // pixel length of this segment
    ang:    number;   // travel direction (atan2)
    cumLen: number;   // cumulative length at start of this segment
    sector: string;   // 'S1' | 'S2' | 'S3' | 'S4'
}

function segLen(a: readonly [number, number], b: readonly [number, number]): number {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
}

// ── Renderer ──────────────────────────────────────────────────────────────────
export class CircuitoBetaRenderer {
    private gfxGrid!:     GameObjects.Graphics;   // static chessboard (bottom layer)
    private gfxBase!:     GameObjects.Graphics;   // track surface + glow
    private gfxSectores!: GameObjects.Graphics;   // sector colour overlays
    private gfxVehiculo!: GameObjects.Graphics;   // vehicle dots (top layer)

    /** Sector boundary fractions — same shape as CircuitoRenderer.frac */
    readonly frac: { s1: number; s2: number; s3: number; s4: number };

    private segs: Seg[] = [];
    private totalLen = 0;

    constructor(scene: Scene) {
        // Layering order: grid → base track → sector overlay → vehicles
        this.gfxGrid     = scene.add.graphics();
        this.gfxBase     = scene.add.graphics();
        this.gfxSectores = scene.add.graphics();
        this.gfxVehiculo = scene.add.graphics();

        // Draw the static chessboard grid (never redrawn after this)
        this.dibujarGrid();

        // Build polyline segments from waypoints
        const N = PTS.length;
        let cum = 0;
        for (let i = 0; i < N; i++) {
            const p1  = PTS[i];
            const p2  = PTS[(i + 1) % N];
            const len = segLen(p1, p2);
            const sec = i < S2_IDX ? 'S1'
                      : i < S3_IDX ? 'S2'
                      : i < S4_IDX ? 'S3'
                      :              'S4';
            this.segs.push({
                x1: p1[0], y1: p1[1],
                x2: p2[0], y2: p2[1],
                len,
                ang:    Math.atan2(p2[1] - p1[1], p2[0] - p1[0]),
                cumLen: cum,
                sector: sec,
            });
            cum += len;
        }
        this.totalLen = cum;

        // Sector boundary fractions derived from cumulative lengths
        const fracAt = (ptIdx: number) => this.segs[ptIdx].cumLen / this.totalLen;
        this.frac = {
            s1: 0,
            s2: fracAt(S2_IDX),
            s3: fracAt(S3_IDX),
            s4: fracAt(S4_IDX),
        };

        // START label next to P0 (main straight runs vertically upward from here)
        const [sx, sy] = PTS[0];
        scene.add.text(sx + 10, sy - 18, 'START', {
            fontSize: '12px', fontFamily: FONT,
            color: '#ffffff', fontStyle: 'bold',
        });
    }

    // ── Static chessboard grid (drawn once in constructor) ────────────────────
    private dibujarGrid() {
        const g = this.gfxGrid;

        // Alternating dark tiles
        for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
                const x    = col * TILE;
                const y    = GRID_Y0 + row * TILE;
                const dark = (row + col) % 2 === 0;
                g.fillStyle(dark ? 0x040b14 : 0x060f1c, 1);
                g.fillRect(x, y, TILE, TILE);
            }
        }

        // Subtle grid lines
        g.lineStyle(1, 0x1a2a3a, 0.55);
        for (let col = 0; col <= GRID_COLS; col++) {
            const x = col * TILE;
            g.lineBetween(x, GRID_Y0, x, GRID_Y0 + GRID_ROWS * TILE);
        }
        for (let row = 0; row <= GRID_ROWS; row++) {
            const y = GRID_Y0 + row * TILE;
            g.lineBetween(0, y, GRID_COLS * TILE, y);
        }

        // Dot markers at grid intersections
        g.fillStyle(0x1e3350, 0.7);
        for (let row = 0; row <= GRID_ROWS; row++) {
            for (let col = 0; col <= GRID_COLS; col++) {
                g.fillCircle(col * TILE, GRID_Y0 + row * TILE, 2);
            }
        }
    }

    // ── Called when the active sector changes ─────────────────────────────────
    dibujarCircuito(sectorActivo: string) {
        this.gfxBase.clear();
        this.gfxSectores.clear();

        // Outer glow / border layers
        this.trazarPista(this.gfxBase, TW + 12, 0x0a1828, 1.0);
        this.trazarPista(this.gfxBase, TW +  6, 0x1e3350, 1.0);

        // Dark asphalt surface
        this.trazarPista(this.gfxBase, TW, 0x0c1520, 1.0);

        // Sector colour overlays
        ['S1', 'S2', 'S3', 'S4'].forEach(s => {
            const isActive = s === sectorActivo;
            this.gfxSectores.lineStyle(
                TW - 2, SECTOR_COLOR_BETA[s], isActive ? 0.92 : 0.18,
            );
            this.trazarSector(this.gfxSectores, s);
        });

        // Start/finish checkered strip (horizontal, perpendicular to the
        // vertical main straight at P0)
        const [sx, sy] = PTS[0];
        const CS = 5, nRows = 4, nCols = 2;
        const mx = sx - Math.floor(TW / 2);
        const my = sy - nRows * CS;
        for (let r = 0; r < nRows; r++) {
            for (let c = 0; c < nCols; c++) {
                this.gfxBase.fillStyle(
                    (r + c) % 2 === 0 ? 0xffffff : 0x000000, 0.9,
                );
                this.gfxBase.fillRect(mx + c * CS, my + r * CS, CS, CS);
            }
        }
    }

    // ── Called every frame from CarreraScene.update() ─────────────────────────
    actualizarVehiculo(
        playerProg: number, rivalProg: number,
        playerBand: number = BAND_PLAYER_BETA,
        rivalBand:  number = BAND_RIVAL_BETA,
    ) {
        this.gfxVehiculo.clear();

        // Rival painted first (rendered under the player)
        const rv = this.calcularPos(rivalProg, rivalBand);
        this.dibujarCarro(rv.x, rv.y, rv.angulo, 0xff4422, 0x881100, 10, 5);

        // Player on top
        const pv = this.calcularPos(playerProg, playerBand);
        this.dibujarCarro(pv.x, pv.y, pv.angulo, 0x00ccff, 0x0055aa, 12, 6);
    }

    // ── Position along the track ──────────────────────────────────────────────
    // t    ∈ [0, 1) — normalised global track progress
    // band — signed lateral offset in pixels
    //        (+) = left of travel direction (outer on left-handers)
    //        (−) = right of travel direction (inner on left-handers)
    calcularPos(t: number, band = 0): { x: number; y: number; angulo: number } {
        const tW     = ((t % 1) + 1) % 1;
        const target = tW * this.totalLen;

        // Binary-search for the segment containing `target`
        let lo = 0, hi = this.segs.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (this.segs[mid].cumLen <= target) lo = mid; else hi = mid - 1;
        }
        const seg    = this.segs[lo];
        const tLocal = seg.len > 0
            ? Math.max(0, Math.min(1, (target - seg.cumLen) / seg.len))
            : 0;

        const cx = seg.x1 + tLocal * (seg.x2 - seg.x1);
        const cy = seg.y1 + tLocal * (seg.y2 - seg.y1);

        // Perpendicular offset (ang + π/2 = left side of travel direction)
        const perp = seg.ang + Math.PI / 2;
        return {
            x:      cx + band * Math.cos(perp),
            y:      cy + band * Math.sin(perp),
            angulo: seg.ang,
        };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Builds a smooth polyline by rounding each waypoint corner with a
     * quadratic Bézier curve.
     *
     * closed = true  → all waypoints are corners (loop).
     * closed = false → first and last waypoints are open endpoints.
     *
     * Each corner is approximated as N `steps` line segments so only the
     * standard moveTo/lineTo/strokePoints API is needed.
     */
    private roundedPolyline(
        pts: readonly [number, number][],
        radius: number,
        closed: boolean,
        steps = 10,
    ): { x: number; y: number }[] {
        const N = pts.length;
        if (N < 2) return pts.map(p => ({ x: p[0], y: p[1] }));

        type Corner = {
            ex: number; ey: number;  // entry  (r before corner)
            cx: number; cy: number;  // control (the original waypoint)
            fx: number; fy: number;  // exit   (r after corner)
        };

        const buildCorner = (i: number): Corner | null => {
            const curr = pts[i];
            const prevIdx = closed ? (i - 1 + N) % N : i - 1;
            const nextIdx = closed ? (i + 1) % N     : i + 1;
            if (prevIdx < 0 || nextIdx >= N) return null;

            const prev = pts[prevIdx];
            const next = pts[nextIdx];
            const dx1 = curr[0] - prev[0], dy1 = curr[1] - prev[1];
            const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
            const dx2 = next[0] - curr[0], dy2 = next[1] - curr[1];
            const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            if (len1 < 1 || len2 < 1) return null;

            const r = Math.min(radius, len1 * 0.45, len2 * 0.45);
            return {
                ex: curr[0] - (dx1 / len1) * r, ey: curr[1] - (dy1 / len1) * r,
                cx: curr[0], cy: curr[1],
                fx: curr[0] + (dx2 / len2) * r, fy: curr[1] + (dy2 / len2) * r,
            };
        };

        const addBezier = (out: { x: number; y: number }[], c: Corner) => {
            for (let s = 1; s <= steps; s++) {
                const t = s / steps, mt = 1 - t;
                out.push({
                    x: mt * mt * c.ex + 2 * mt * t * c.cx + t * t * c.fx,
                    y: mt * mt * c.ey + 2 * mt * t * c.cy + t * t * c.fy,
                });
            }
        };

        const result: { x: number; y: number }[] = [];

        if (closed) {
            // Start at the exit of the first rounded corner so the loop
            // closes seamlessly without relying on closeShape.
            const c0 = buildCorner(0)!;
            result.push({ x: c0.fx, y: c0.fy });

            for (let i = 1; i < N; i++) {
                const c = buildCorner(i);
                if (!c) { result.push({ x: pts[i][0], y: pts[i][1] }); }
                else    { result.push({ x: c.ex, y: c.ey }); addBezier(result, c); }
            }

            // Wrap: line to entry of c0, then the bezier back to c0.fx
            result.push({ x: c0.ex, y: c0.ey });
            addBezier(result, c0);   // last point == first point → perfectly closed

        } else {
            // Open path: endpoint waypoints kept as-is, only interior corners rounded
            result.push({ x: pts[0][0], y: pts[0][1] });

            for (let i = 1; i < N - 1; i++) {
                const c = buildCorner(i);
                if (!c) { result.push({ x: pts[i][0], y: pts[i][1] }); }
                else    { result.push({ x: c.ex, y: c.ey }); addBezier(result, c); }
            }

            result.push({ x: pts[N - 1][0], y: pts[N - 1][1] });
        }

        return result;
    }

    private trazarPista(g: GameObjects.Graphics, width: number, color: number, alpha: number) {
        g.lineStyle(width, color, alpha);
        const pts = this.roundedPolyline(PTS, CORNER_RADIUS, true);
        this.tracePoints(g, pts);
    }

    private trazarSector(g: GameObjects.Graphics, sector: string) {
        const spts = SECTOR_PTS[sector];
        const pts  = this.roundedPolyline(spts, CORNER_RADIUS, false);
        this.tracePoints(g, pts);
    }

    /** Draws a pre-computed point list using beginPath / moveTo / lineTo / strokePath. */
    private tracePoints(g: GameObjects.Graphics, pts: { x: number; y: number }[]) {
        if (pts.length < 2) return;
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.strokePath();
    }

    private dibujarCarro(
        x: number, y: number, angulo: number,
        colorBody: number, colorFront: number,
        w: number, h: number,
    ) {
        const g = this.gfxVehiculo;
        g.save();
        g.translateCanvas(x, y);
        g.rotateCanvas(angulo);
        // Main body
        g.fillStyle(colorBody, 1);
        g.fillRect(-Math.floor(w / 2), -Math.floor(h / 2), w - 3, h);
        // Front direction indicator
        g.fillStyle(colorFront, 1);
        g.fillRect(Math.floor(w / 2) - 3, -Math.floor(h / 2), 3, h);
        // Cockpit dot
        g.fillStyle(0xffffff, 0.6);
        g.fillRect(-1, -1, 3, 3);
        g.restore();
    }
}
