import type { Scene, GameObjects } from 'phaser';

// ── Circuit geometry constants ────────────────────────────────────────────────
export const CX_L = 45;   // left curve center x
export const CX_R = 275;  // right curve center x
export const CY   = 74;   // center y
export const R    = 40;   // curve radius (semicircle)
const TW          = 9;    // track width

const STRAIGHT = CX_R - CX_L;                // 230
const ARC_LEN  = Math.PI * R;                 // ≈ 125.7
const TOTAL    = 2 * STRAIGHT + 2 * ARC_LEN; // ≈ 711.4

// Progress fraction (0–1) at the START of each sector
export const FRAC = {
    s1: 0,
    s2: STRAIGHT / TOTAL,                    // ≈ 0.323
    s3: (STRAIGHT + ARC_LEN) / TOTAL,        // ≈ 0.500
    s4: (2 * STRAIGHT + ARC_LEN) / TOTAL,    // ≈ 0.677 + ...
};

export const SECTOR_COLOR: Record<string, number> = {
    S1: 0x50c860,   // green  — recta principal
    S2: 0x5070e0,   // blue   — curva norte
    S3: 0xe06040,   // orange — recta trasera
    S4: 0xe0b040,   // amber  — curva sur
};

const SECTOR_IDS = ['S1', 'S2', 'S3', 'S4'];
const FONT       = "'Open Sans', sans-serif";

export class CircuitoRenderer {
    private gfxBase!:     GameObjects.Graphics;
    private gfxSectores!: GameObjects.Graphics;
    private gfxVehiculo!: GameObjects.Graphics;

    constructor(private scene: Scene) {
        this.gfxBase     = scene.add.graphics();
        this.gfxSectores = scene.add.graphics();
        this.gfxVehiculo = scene.add.graphics();

        // Static "START" label at the meta position
        scene.add.text(CX_L + 3, CY + R + 4, 'START', {
            fontSize: '7px',
            fontFamily: FONT,
            color: '#ffffff',
            fontStyle: 'bold',
        });
    }

    // ── Called whenever the active sector changes (not every frame) ────────────
    dibujarCircuito(sectorActivo: string) {
        this.gfxBase.clear();
        this.gfxSectores.clear();

        // Outer border / glow
        this.gfxBase.lineStyle(TW + 8, 0x0e1a2b, 1.0);
        this.trazarOval(this.gfxBase);

        this.gfxBase.lineStyle(TW + 4, 0x1e3350, 1.0);
        this.trazarOval(this.gfxBase);

        // Dark track surface
        this.gfxBase.lineStyle(TW, 0x0c1520, 1.0);
        this.trazarOval(this.gfxBase);

        // Sector color overlays
        SECTOR_IDS.forEach(s => {
            const isActive = s === sectorActivo;
            this.gfxSectores.lineStyle(TW - 1, SECTOR_COLOR[s], isActive ? 0.92 : 0.20);
            this.trazarSegmento(this.gfxSectores, s);
        });

        // Center-line dashes on straights
        this.gfxBase.fillStyle(0x2a4060, 0.7);
        const DASH_W = 5, DASH_GAP = 10;
        for (let x = CX_L + 22; x < CX_R - 15; x += DASH_GAP) {
            this.gfxBase.fillRect(x, CY + R,     DASH_W, 1);
            this.gfxBase.fillRect(x, CY - R - 1, DASH_W, 1);
        }

        // Meta / start-finish checkered line
        const mx = CX_L + 2;
        const my = CY + R - Math.floor(TW / 2);
        const CS = 2;
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 2; col++) {
                this.gfxBase.fillStyle((row + col) % 2 === 0 ? 0xffffff : 0x000000, 0.9);
                this.gfxBase.fillRect(mx + col * CS, my + row * CS, CS, CS);
            }
        }
    }

    // ── Called every frame from CarreraScene.update() ─────────────────────────
    actualizarVehiculo(progreso: number, posicion: number) {
        this.gfxVehiculo.clear();

        // Player vehicle (cyan)
        const p = this.calcularPos(progreso);
        this.dibujarCarro(p.x, p.y, p.angulo, 0x00ccff, 0x0055aa, 8, 5);

        // Single rival at offset derived from position delta
        const rivalProg = (progreso + 0.47 + (posicion - 1) * 0.06) % 1;
        const rv = this.calcularPos(rivalProg);
        this.dibujarCarro(rv.x, rv.y, rv.angulo, 0xff4422, 0x881100, 7, 4);
    }

    // ── Position calculation along circuit (t = 0–1) ──────────────────────────
    calcularPos(t: number): { x: number; y: number; angulo: number } {
        const { s2: F2, s3: F3, s4: F4 } = FRAC;
        const PI = Math.PI;

        if (t < F2) {
            // S1: bottom straight → moving right
            const tl = t / F2;
            return { x: CX_L + tl * STRAIGHT, y: CY + R, angulo: 0 };
        }
        if (t < F3) {
            // S2: right curve (counterclockwise from bottom through right to top)
            const tl = (t - F2) / (F3 - F2);
            const θ  = PI / 2 - PI * tl;   // PI/2 → -PI/2
            return {
                x:      CX_R + R * Math.cos(θ),
                y:      CY   + R * Math.sin(θ),
                angulo: Math.atan2(-Math.cos(θ), Math.sin(θ)),
            };
        }
        if (t < F4) {
            // S3: top straight → moving left
            const tl = (t - F3) / (F4 - F3);
            return { x: CX_R - tl * STRAIGHT, y: CY - R, angulo: PI };
        }
        // S4: left curve (counterclockwise from top through left to bottom)
        const tl = (t - F4) / (1 - F4);
        const θ  = -PI / 2 - PI * tl;      // -PI/2 → -3PI/2
        return {
            x:      CX_L + R * Math.cos(θ),
            y:      CY   + R * Math.sin(θ),
            angulo: Math.atan2(-Math.cos(θ), Math.sin(θ)),
        };
    }

    // ── Internal helpers ──────────────────────────────────────────────────────
    private dibujarCarro(
        x: number, y: number, angulo: number,
        colorBody: number, colorFront: number,
        w: number, h: number
    ) {
        const g = this.gfxVehiculo;
        const hw = Math.floor(w / 2);
        const hh = Math.floor(h / 2);
        g.save();
        g.translateCanvas(x, y);
        g.rotateCanvas(angulo);
        // Body
        g.fillStyle(colorBody, 1);
        g.fillRect(-hw, -hh, w - 2, h);
        // Front accent
        g.fillStyle(colorFront, 1);
        g.fillRect(hw - 2, -hh, 2, h);
        // Cockpit highlight
        g.fillStyle(0xffffff, 0.8);
        g.fillRect(-1, -1, 2, 2);
        g.restore();
    }

    private trazarOval(g: GameObjects.Graphics) {
        g.beginPath();
        g.moveTo(CX_L, CY + R);
        g.lineTo(CX_R, CY + R);                                  // S1 bottom straight
        g.arc(CX_R, CY, R, Math.PI / 2,  -Math.PI / 2,  true);  // S2 right curve
        g.lineTo(CX_L, CY - R);                                  // S3 top straight
        g.arc(CX_L, CY, R, -Math.PI / 2,  Math.PI / 2,  true);  // S4 left curve
        g.closePath();
        g.strokePath();
    }

    private trazarSegmento(g: GameObjects.Graphics, sector: string) {
        g.beginPath();
        switch (sector) {
            case 'S1':
                g.moveTo(CX_L, CY + R);
                g.lineTo(CX_R, CY + R);
                break;
            case 'S2':
                g.moveTo(CX_R, CY + R);
                g.arc(CX_R, CY, R, Math.PI / 2,  -Math.PI / 2, true);
                break;
            case 'S3':
                g.moveTo(CX_R, CY - R);
                g.lineTo(CX_L, CY - R);
                break;
            case 'S4':
                g.moveTo(CX_L, CY - R);
                g.arc(CX_L, CY, R, -Math.PI / 2,  Math.PI / 2, true);
                break;
        }
        g.strokePath();
    }
}
