import type { Scene, GameObjects } from 'phaser';

// ── Circuit geometry (canvas 960 × 540) ───────────────────────────────────────
export const CX_L = 168;   // left curve center x
export const CX_R = 792;   // right curve center x
export const CY   = 228;   // center y
export const R    = 148;   // curve radius
const TW          = 28;    // track width (±14 from centerline)

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

// ── Racing line lateral bands ──────────────────────────────────────────────────
// band > 0 → outer on straights, inner at apex (late-apex, player)
// band < 0 → inner on straights, outer at apex (rival)
// Separation on straight & at apex = |BAND_PLAYER| + |BAND_RIVAL| = 13 px
const BAND_PLAYER =  9;
const BAND_RIVAL  = -4;

export class CircuitoRenderer {
    private gfxBase!:     GameObjects.Graphics;
    private gfxSectores!: GameObjects.Graphics;
    private gfxVehiculo!: GameObjects.Graphics;

    constructor(scene: Scene) {
        this.gfxBase     = scene.add.graphics();
        this.gfxSectores = scene.add.graphics();
        this.gfxVehiculo = scene.add.graphics();

        // Static START label at meta position
        scene.add.text(CX_L + 8, CY + R + 10, 'START', {
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
    // playerProg / rivalProg: independent track progress values [0, 1)
    actualizarVehiculo(playerProg: number, rivalProg: number) {
        this.gfxVehiculo.clear();

        // Rival primero (se pinta debajo del jugador)
        const rv = this.calcularPos(rivalProg, BAND_RIVAL);
        this.dibujarCarro(rv.x, rv.y, rv.angulo, 0xff4422, 0x881100, 10, 5);

        // Jugador encima
        const p = this.calcularPos(playerProg, BAND_PLAYER);
        this.dibujarCarro(p.x, p.y, p.angulo, 0x00ccff, 0x0055aa, 12, 6);
    }

    // ── Calcula posición con línea de carrera (racing line) ───────────────────
    // band > 0: outer en rectas → inner en apex (late apex)
    // band < 0: inner en rectas → outer en apex (anti-late apex / rival)
    // Fórmula curvas: r = R + band · cos(2π·tl)
    //   tl=0  → r=R+band (entrada exterior/interior según signo)
    //   tl=0.5 → r=R-band (apex opuesto)
    //   tl=1  → r=R+band (salida = misma que entrada → continuidad ✓)
    calcularPos(t: number, band: number = 0): { x: number; y: number; angulo: number } {
        const { s2: F2, s3: F3, s4: F4 } = FRAC;
        const PI = Math.PI;

        if (t < F2) {
            // S1: recta inferior, izquierda → derecha
            const tl = t / F2;
            return { x: CX_L + tl * STRAIGHT, y: CY + R + band, angulo: 0 };
        }

        if (t < F3) {
            // S2: curva derecha (horaria, de π/2 → -π/2)
            const tl = (t - F2) / (F3 - F2);
            const r  = R + band * Math.cos(2 * PI * tl);
            const θ  = PI / 2 - PI * tl;
            return {
                x:      CX_R + r * Math.cos(θ),
                y:      CY   + r * Math.sin(θ),
                angulo: Math.atan2(-Math.cos(θ), Math.sin(θ)),
            };
        }

        if (t < F4) {
            // S3: recta superior, derecha → izquierda
            const tl = (t - F3) / (F4 - F3);
            return { x: CX_R - tl * STRAIGHT, y: CY - R - band, angulo: PI };
        }

        // S4: curva izquierda (horaria, de -π/2 → -3π/2)
        const tl = (t - F4) / (1 - F4);
        const r  = R + band * Math.cos(2 * PI * tl);
        const θ  = -PI / 2 - PI * tl;
        return {
            x:      CX_L + r * Math.cos(θ),
            y:      CY   + r * Math.sin(θ),
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
        // Cuerpo principal
        g.fillStyle(colorBody, 1);
        g.fillRect(-Math.floor(w / 2), -Math.floor(h / 2), w - 3, h);
        // Frente (dirección de marcha)
        g.fillStyle(colorFront, 1);
        g.fillRect(Math.floor(w / 2) - 3, -Math.floor(h / 2), 3, h);
        // Punto de cockpit
        g.fillStyle(0xffffff, 0.6);
        g.fillRect(-1, -1, 3, 3);
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
