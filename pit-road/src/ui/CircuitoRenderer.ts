import type { Scene, GameObjects } from 'phaser';
import type { CircuitoComputado } from '../types';
import { calcularPos } from '../systems/CircuitoBuilder';

const TW   = 11;  // track width in canvas pixels
const FONT = "'Open Sans', sans-serif";

// Auto color palette — enough for up to 12 sectors
const PALETA: number[] = [
    0x50c860, 0x5070e0, 0xe06040, 0xe0b040,
    0xc050e0, 0x40c0c0, 0xe0c050, 0x6050e0,
    0xe05090, 0x50a0e0, 0xa0e050, 0xe08040,
];

export function colorDeSector(idx: number): number {
    return PALETA[idx % PALETA.length];
}

export class CircuitoRenderer {
    private gfxBase!:     GameObjects.Graphics;
    private gfxSectores!: GameObjects.Graphics;
    private gfxVehiculo!: GameObjects.Graphics;

    constructor(
        scene: Scene,
        private circuito: CircuitoComputado,
    ) {
        this.gfxBase     = scene.add.graphics();
        this.gfxSectores = scene.add.graphics();
        this.gfxVehiculo = scene.add.graphics();

        const start = circuito.puntos[0];
        if (start) {
            scene.add.text(start.x + 2, start.y + 3, 'START', {
                fontSize: '6px', fontFamily: FONT, color: '#ffffff', fontStyle: 'bold',
            });
        }
    }

    // Called when the active sector changes
    dibujarCircuito(sectorActivoIdx: number) {
        this.gfxBase.clear();
        this.gfxSectores.clear();

        // Outer glow layers
        this.gfxBase.lineStyle(TW + 8, 0x0e1a2b, 1.0);
        this.trazarPath(this.gfxBase);
        this.gfxBase.lineStyle(TW + 4, 0x1e3350, 1.0);
        this.trazarPath(this.gfxBase);

        // Track surface
        this.gfxBase.lineStyle(TW, 0x0c1520, 1.0);
        this.trazarPath(this.gfxBase);

        // Sector color overlays
        this.circuito.sectores.forEach((_, idx) => {
            const isActive = idx === sectorActivoIdx;
            this.gfxSectores.lineStyle(TW - 2, colorDeSector(idx), isActive ? 0.90 : 0.18);
            this.trazarSector(this.gfxSectores, idx);
        });

        this.dibujarMeta();
    }

    // Called every frame from scene.update()
    actualizarVehiculo(t: number, posicion: number) {
        this.gfxVehiculo.clear();

        const p = calcularPos(t, this.circuito.puntos);
        this.dibujarCarro(p.x, p.y, p.angulo, 0x00ccff, 0x0055aa, 8, 5);

        const rivalT = (t + 0.47 + (posicion - 1) * 0.06) % 1;
        const rv     = calcularPos(rivalT, this.circuito.puntos);
        this.dibujarCarro(rv.x, rv.y, rv.angulo, 0xff4422, 0x881100, 7, 4);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private trazarPath(g: GameObjects.Graphics) {
        const pts = this.circuito.puntos;
        if (pts.length < 2) return;
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.closePath();
        g.strokePath();
    }

    private trazarSector(g: GameObjects.Graphics, sectorIdx: number) {
        const pts = this.circuito.puntos.filter(p => p.compIdx === sectorIdx);
        if (pts.length < 2) return;
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.strokePath();
    }

    private dibujarMeta() {
        const p = this.circuito.puntos[0];
        if (!p) return;
        const CS = 2;
        const mx = p.x - CS;
        const my = p.y - Math.floor(TW / 2);
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 2; col++) {
                this.gfxBase.fillStyle((row + col) % 2 === 0 ? 0xffffff : 0x000000, 0.9);
                this.gfxBase.fillRect(mx + col * CS, my + row * CS, CS, CS);
            }
        }
    }

    private dibujarCarro(
        x: number, y: number, angulo: number,
        colorBody: number, colorFront: number,
        w: number, h: number,
    ) {
        const g  = this.gfxVehiculo;
        const hw = Math.floor(w / 2);
        const hh = Math.floor(h / 2);
        g.save();
        g.translateCanvas(x, y);
        g.rotateCanvas(angulo);
        g.fillStyle(colorBody, 1);
        g.fillRect(-hw, -hh, w - 2, h);
        g.fillStyle(colorFront, 1);
        g.fillRect(hw - 2, -hh, 2, h);
        g.fillStyle(0xffffff, 0.8);
        g.fillRect(-1, -1, 2, 2);
        g.restore();
    }
}
