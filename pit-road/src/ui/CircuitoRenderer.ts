import type { Scene, GameObjects } from 'phaser';

// ── Circuit geometry (canvas 960 × 540) ───────────────────────────────────────
export const CX_L = 168;   // left curve center x
export const CX_R = 792;   // right curve center x
export const CY   = 228;   // center y  (header=44, circuit area top~54, bottom~402)
export const R    = 148;   // curve radius
const TW          = 22;    // track width

const STRAIGHT = CX_R - CX_L;                 // 624
const ARC_LEN  = Math.PI * R;                  // ≈ 464.9
const TOTAL    = 2 * STRAIGHT + 2 * ARC_LEN;  // ≈ 2177.8

export const FRAC = {
    s1: 0,
    s2: STRAIGHT / TOTAL,
    s3: (STRAIGHT + ARC_LEN) / TOTAL,
    s4: (2 * STRAIGHT + ARC_LEN) / TOTAL,
};

export const SECTOR_COLOR: Record<string, number> = {
    S1: 0x50c860,
    S2: 0x5070e0,
    S3: 0xe06040,
    S4: 0xe0b040,
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

        // Static START label at the meta position
        scene.add.text(CX_L + 8, CY + R + 8, 'START', {
            fontSize: '12px',
            fontFamily: FONT,
            color: '#ffffff',
            fontStyle: 'bold',
        });
    }

    // ── Called when active sector changes ─────────────────────────────────────
    dibujarCircuito(sectorActivo: string) {
        this.gfxBase.clear();
        this.gfxSectores.clear();

        // Outer glow / border layers
        this.gfxBase.lineStyle(TW + 12, 0x0a1828, 1.0);
        this.trazarOval(this.gfxBase);
        this.gfxBase.lineStyle(TW + 6, 0x1e3350, 1.0);
        this.trazarOval(this.gfxBase);

        // Dark track surface
        this.gfxBase.lineStyle(TW, 0x0c1520, 1.0);
        this.trazarOval(this.gfxBase);

        // Sector color overlays
        SECTOR_IDS.forEach(s => {
            const isActive = s === sectorActivo;
            this.gfxSectores.lineStyle(TW - 2, SECTOR_COLOR[s], isActive ? 0.92 : 0.18);
            this.trazarSegmento(this.gfxSectores, s);
        });

        // Center dashes on straights
        this.gfxBase.fillStyle(0x2a4060, 0.6);
        const DASH_W = 14, DASH_GAP = 28;
        for (let x = CX_L + 60; x < CX_R - 50; x += DASH_GAP) {
            this.gfxBase.fillRect(x, CY + R,     DASH_W, 2);
            this.gfxBase.fillRect(x, CY - R - 2, DASH_W, 2);
        }

        // Meta (start/finish) checkered line
        const mx = CX_L + 6;
        const my = CY + R - Math.floor(TW / 2);
        const CS = 5;
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

        // Player (cyan)
        const p = this.calcularPos(progreso);
        this.dibujarCarro(p.x, p.y, p.angulo, 0x00ccff, 0x0055aa, 20, 12);

        // Rival (offset by position)
        const rivalProg = (progreso + 0.45 + (posicion - 1) * 0.05) % 1;
        const rv = this.calcularPos(rivalProg);
        this.dibujarCarro(rv.x, rv.y, rv.angulo, 0xff4422, 0x881100, 18, 11);
    }

    calcularPos(t: number): { x: number; y: number; angulo: number } {
        const { s2: F2, s3: F3, s4: F4 } = FRAC;
        const PI = Math.PI;

        if (t < F2) {
            const tl = t / F2;
            return { x: CX_L + tl * STRAIGHT, y: CY + R, angulo: 0 };
        }
        if (t < F3) {
            const tl = (t - F2) / (F3 - F2);
            const θ  = PI / 2 - PI * tl;
            return {
                x:      CX_R + R * Math.cos(θ),
                y:      CY   + R * Math.sin(θ),
                angulo: Math.atan2(-Math.cos(θ), Math.sin(θ)),
            };
        }
        if (t < F4) {
            const tl = (t - F3) / (F4 - F3);
            return { x: CX_R - tl * STRAIGHT, y: CY - R, angulo: Math.PI };
        }
        const tl = (t - F4) / (1 - F4);
        const θ  = -Math.PI / 2 - Math.PI * tl;
        return {
            x:      CX_L + R * Math.cos(θ),
            y:      CY   + R * Math.sin(θ),
            angulo: Math.atan2(-Math.cos(θ), Math.sin(θ)),
        };
    }

    private dibujarCarro(
        x: number, y: number, angulo: number,
        colorBody: number, colorFront: number,
        w: number, h: number
    ) {
        const g = this.gfxVehiculo;
        g.save();
        g.translateCanvas(x, y);
        g.rotateCanvas(angulo);
        g.fillStyle(colorBody, 1);
        g.fillRect(-Math.floor(w / 2), -Math.floor(h / 2), w - 4, h);
        g.fillStyle(colorFront, 1);
        g.fillRect(Math.floor(w / 2) - 4, -Math.floor(h / 2), 4, h);
        g.fillStyle(0xffffff, 0.7);
        g.fillRect(-2, -2, 4, 4);
        g.restore();
    }

    private trazarOval(g: GameObjects.Graphics) {
        g.beginPath();
        g.moveTo(CX_L, CY + R);
        g.lineTo(CX_R, CY + R);
        g.arc(CX_R, CY, R, Math.PI / 2,  -Math.PI / 2, true);
        g.lineTo(CX_L, CY - R);
        g.arc(CX_L, CY, R, -Math.PI / 2,  Math.PI / 2, true);
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
