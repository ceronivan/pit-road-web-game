import type { Scene, GameObjects } from 'phaser';

// ── Track geometry (960×540 canvas) ──────────────────────────────────────────
// Inspired by a technical street circuit (clockwise, start/finish bottom-left).
// Waypoints trace the CENTERLINE; sector boundaries are defined by point index.
//
//   Sector layout (matches reference image):
//     S1 (green)  – long main straight + top-left hairpin
//     S2 (blue)   – technical right section (multiple corners)
//     S3 (red)    – right side + bottom-right transition
//     S4 (yellow) – bottom return to start
//
const PTS: readonly [number, number][] = [
    [162, 445],  //  0 — START/FINISH
    [162,  80],  //  1 — top of main straight  ← S1 ends before here
    [238,  58],  //  2 — after top-left hairpin
    [345,  58],  //  3 — top straight
    [452,  58],  //  4 ← S2 starts            — entering technical
    [512, 100],  //  5 — first bend down
    [522, 168],  //  6 — short down section
    [582, 204],  //  7 — S-curve
    [712, 204],  //  8 — mid technical straight
    [802, 242],  //  9 ← S3 starts            — right side
    [836, 330],  // 10 — going down right side
    [836, 418],  // 11 — approaching bottom right
    [800, 452],  // 12 — corner to bottom straight
    [628, 462],  // 13 ← S4 starts            — bottom section
    [516, 420],  // 14 — left turn
    [376, 420],  // 15 — bottom left straight
    [300, 445],  // 16 — before bottom hairpin
    [232, 445],  // 17 — bottom hairpin
    // → closes back to [162, 445] = PTS[0]
];

// First point index of each sector (0-based)
const S2_IDX = 4;
const S3_IDX = 9;
const S4_IDX = 13;

const TW   = 28;   // track width in pixels (same as Circuito Alfa)
const FONT = "'Open Sans', sans-serif";

export const SECTOR_COLOR_BETA: Record<string, number> = {
    S1: 0x50c860,
    S2: 0x5070e0,
    S3: 0xe06040,
    S4: 0xe0b040,
};

export const BAND_PLAYER_BETA =  9;
export const BAND_RIVAL_BETA  = -4;

// ── Internal segment representation ──────────────────────────────────────────
interface Seg {
    x1: number; y1: number;
    x2: number; y2: number;
    len:     number;  // pixel length of this segment
    ang:     number;  // travel direction (atan2)
    cumLen:  number;  // accumulated length at start of this segment
    sector:  string;  // S1 | S2 | S3 | S4
}

function segLen(a: readonly [number,number], b: readonly [number,number]): number {
    const dx = b[0]-a[0], dy = b[1]-a[1];
    return Math.sqrt(dx*dx + dy*dy);
}

// ── Renderer ──────────────────────────────────────────────────────────────────
export class CircuitoBetaRenderer {
    private gfxBase!:     GameObjects.Graphics;
    private gfxSectores!: GameObjects.Graphics;
    private gfxVehiculo!: GameObjects.Graphics;

    /** Sector boundary fractions — mirrors the shape of FRAC in CircuitoRenderer */
    readonly frac: { s1: number; s2: number; s3: number; s4: number };

    private segs: Seg[] = [];
    private totalLen = 0;

    constructor(scene: Scene) {
        this.gfxBase     = scene.add.graphics();
        this.gfxSectores = scene.add.graphics();
        this.gfxVehiculo = scene.add.graphics();

        const N = PTS.length;

        // Build segments (each connects PTS[i] → PTS[(i+1)%N])
        let cum = 0;
        for (let i = 0; i < N; i++) {
            const p1 = PTS[i];
            const p2 = PTS[(i + 1) % N];
            const len = segLen(p1, p2);
            const sec = i < S2_IDX ? 'S1'
                      : i < S3_IDX ? 'S2'
                      : i < S4_IDX ? 'S3'
                      :              'S4';
            this.segs.push({
                x1: p1[0], y1: p1[1],
                x2: p2[0], y2: p2[1],
                len, ang: Math.atan2(p2[1]-p1[1], p2[0]-p1[0]),
                cumLen: cum, sector: sec,
            });
            cum += len;
        }
        this.totalLen = cum;

        // Compute sector FRAC values from cumulative lengths at sector boundaries
        const fracAt = (ptIdx: number) => this.segs[ptIdx].cumLen / this.totalLen;
        this.frac = {
            s1: 0,
            s2: fracAt(S2_IDX),
            s3: fracAt(S3_IDX),
            s4: fracAt(S4_IDX),
        };

        // START label next to start/finish
        scene.add.text(PTS[0][0] + 10, PTS[0][1] - 18, 'START', {
            fontSize: '12px', fontFamily: FONT,
            color: '#ffffff', fontStyle: 'bold',
        });
    }

    // ── Called when active sector changes ────────────────────────────────────
    dibujarCircuito(sectorActivo: string) {
        this.gfxBase.clear();
        this.gfxSectores.clear();

        // Glow / shadow layers
        this.trazarPista(this.gfxBase, TW + 12, 0x0a1828, 1.0);
        this.trazarPista(this.gfxBase, TW +  6, 0x1e3350, 1.0);
        // Dark asphalt
        this.trazarPista(this.gfxBase, TW,      0x0c1520, 1.0);

        // Sector color overlays
        ['S1','S2','S3','S4'].forEach(s => {
            const isActive = s === sectorActivo;
            this.gfxSectores.lineStyle(TW - 2, SECTOR_COLOR_BETA[s], isActive ? 0.92 : 0.18);
            this.trazarSector(this.gfxSectores, s);
        });

        // Start/finish checkered strip (perpendicular to main straight → horizontal)
        const [sx, sy] = PTS[0];
        const CS = 5, rows = 4, cols = 2;
        const mx = sx - Math.floor(TW / 2);
        const my = sy - rows * CS;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                this.gfxBase.fillStyle((r + c) % 2 === 0 ? 0xffffff : 0x000000, 0.9);
                this.gfxBase.fillRect(mx + c * CS, my + r * CS, CS, CS);
            }
        }
    }

    // ── Called every frame ───────────────────────────────────────────────────
    actualizarVehiculo(
        playerProg: number, rivalProg: number,
        playerBand: number = BAND_PLAYER_BETA,
        rivalBand:  number = BAND_RIVAL_BETA,
    ) {
        this.gfxVehiculo.clear();

        const rv = this.calcularPos(rivalProg, rivalBand);
        this.dibujarCarro(rv.x, rv.y, rv.angulo, 0xff4422, 0x881100, 10, 5);

        const pv = this.calcularPos(playerProg, playerBand);
        this.dibujarCarro(pv.x, pv.y, pv.angulo, 0x00ccff, 0x0055aa, 12, 6);
    }

    // ── Position along the track ─────────────────────────────────────────────
    // t ∈ [0,1) — global track progress
    // band — signed lateral offset in pixels (+ = left of travel, - = right)
    calcularPos(t: number, band = 0): { x: number; y: number; angulo: number } {
        const tW = ((t % 1) + 1) % 1;
        const target = tW * this.totalLen;

        // Binary-search the segment containing `target`
        let lo = 0, hi = this.segs.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (this.segs[mid].cumLen <= target) lo = mid; else hi = mid - 1;
        }
        const seg = this.segs[lo];

        const tLocal = seg.len > 0 ? Math.max(0, Math.min(1, (target - seg.cumLen) / seg.len)) : 0;
        const cx = seg.x1 + tLocal * (seg.x2 - seg.x1);
        const cy = seg.y1 + tLocal * (seg.y2 - seg.y1);

        // Band offset: perpendicular to travel (angle + π/2 = left side)
        const perp = seg.ang + Math.PI / 2;
        return {
            x:      cx + band * Math.cos(perp),
            y:      cy + band * Math.sin(perp),
            angulo: seg.ang,
        };
    }

    // ── Private helpers ──────────────────────────────────────────────────────
    private trazarPista(g: GameObjects.Graphics, width: number, color: number, alpha: number) {
        g.lineStyle(width, color, alpha);
        g.beginPath();
        g.moveTo(PTS[0][0], PTS[0][1]);
        for (let i = 1; i < PTS.length; i++) g.lineTo(PTS[i][0], PTS[i][1]);
        g.closePath();
        g.strokePath();
    }

    private trazarSector(g: GameObjects.Graphics, sector: string) {
        g.beginPath();
        let started = false;
        for (const seg of this.segs) {
            if (seg.sector !== sector) { started = false; continue; }
            if (!started) { g.moveTo(seg.x1, seg.y1); started = true; }
            g.lineTo(seg.x2, seg.y2);
        }
        if (started) g.strokePath();
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
        g.fillStyle(colorBody, 1);
        g.fillRect(-Math.floor(w / 2), -Math.floor(h / 2), w - 3, h);
        g.fillStyle(colorFront, 1);
        g.fillRect(Math.floor(w / 2) - 3, -Math.floor(h / 2), 3, h);
        g.fillStyle(0xffffff, 0.6);
        g.fillRect(-1, -1, 3, 3);
        g.restore();
    }
}
