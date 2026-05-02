import { Scene, GameObjects } from 'phaser';
import type { DatosResultadosScene, EstadoCarrera, ResultadoCarrera } from '../../types';
import { estilos, COLOR } from '../../utils/estilos';

const FONT = "'Open Sans', sans-serif";

const MEDALLA_LABEL = ['🥇 ORO', '🥈 PLATA', '🥉 BRONCE', '4°', '5°', '6°'];
const MEDALLA_COLOR = ['#ffcc00', '#cccccc', '#cc8833', '#7ab8e8', '#7ab8e8', '#5888a8'];

// ── Layout ────────────────────────────────────────────────────────────────────
const HEADER_H = 13;
const BTN_Y    = 163;

export class ResultadosScene extends Scene {
    constructor() { super('ResultadosScene'); }

    init(datos: DatosResultadosScene) {
        this.registry.set('ultimoResultado', datos);
    }

    create() {
        const { resultado, estadoCarrera }: DatosResultadosScene = this.registry.get('ultimoResultado');

        this.dibujarFondo();
        this.dibujarHeader(resultado.abandono);
        this.dibujarHeroPosicion(resultado);
        this.dibujarGridStats(resultado, estadoCarrera);
        this.dibujarSaludCarro(estadoCarrera);
        this.dibujarBoton();
    }

    // ── Background ────────────────────────────────────────────────────────────
    private dibujarFondo() {
        const g = this.add.graphics();
        g.fillStyle(COLOR.BG, 1);
        g.fillRect(0, 0, 320, 180);

        g.fillStyle(COLOR.STRIP_BG, 1);
        g.fillRect(0, BTN_Y - 2, 320, 180 - BTN_Y + 2);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.4);
        g.lineBetween(0, BTN_Y - 2, 320, BTN_Y - 2);
    }

    // ── Header ────────────────────────────────────────────────────────────────
    private dibujarHeader(abandono: boolean) {
        const g = this.add.graphics();
        g.fillStyle(COLOR.HEADER_BG, 1);
        g.fillRect(0, 0, 320, HEADER_H);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.5);
        g.lineBetween(0, HEADER_H, 320, HEADER_H);

        const titulo = abandono ? 'ABANDONO' : 'RESULTADO FINAL';
        const color  = abandono ? '#ff4455' : '#7ab8e8';
        this.add.text(4, 2, titulo, { fontSize: '12px', fontFamily: FONT, color, fontStyle: 'bold' });
        this.add.text(260, 2, 'Circuito Alfa', { fontSize: '12px', fontFamily: FONT, color: '#334455' });
    }

    // ── Hero: big position ────────────────────────────────────────────────────
    private dibujarHeroPosicion(resultado: ResultadoCarrera) {
        const pos      = resultado.posicionFinal;
        const medal    = MEDALLA_LABEL[pos - 1] ?? `${pos}°`;
        const color    = MEDALLA_COLOR[pos - 1] ?? '#5888a8';
        const Y_TOP    = HEADER_H + 4;

        // Card background
        const g = this.add.graphics();
        g.fillStyle(COLOR.CARD_BG, 1);
        g.fillRoundedRect(4, Y_TOP, 150, 56, 4);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.6);
        g.strokeRoundedRect(4.5, Y_TOP + 0.5, 149, 55, 4);

        // Medal label
        this.add.text(12, Y_TOP + 8, medal, {
            fontSize: '20px', fontFamily: FONT, color, fontStyle: 'bold',
        });

        // Points
        this.add.text(12, Y_TOP + 34, `${resultado.puntosObtenidos} puntos`, {
            fontSize: '12px', fontFamily: FONT, color: '#4a7898',
        });

        // Laps completed
        this.add.text(80, Y_TOP + 34, `${resultado.vueltasCompletadas} vueltas`, {
            fontSize: '12px', fontFamily: FONT, color: '#4a7898',
        });

        // Right: stat summary card
        const g2 = this.add.graphics();
        g2.fillStyle(COLOR.CARD_BG, 1);
        g2.fillRoundedRect(160, Y_TOP, 156, 56, 4);
        g2.lineStyle(1, COLOR.CARD_BORDER, 0.6);
        g2.strokeRoundedRect(160.5, Y_TOP + 0.5, 155, 55, 4);

        this.add.text(168, Y_TOP + 6, 'DAÑO AL CARRO', estilos.cardLabel);
        const danoColor = resultado.danoRecibido > 60 ? '#ff4455' : resultado.danoRecibido > 30 ? '#ffcc00' : '#4cdf80';
        this.add.text(168, Y_TOP + 18, `${resultado.danoRecibido}%`, {
            fontSize: '18px', fontFamily: FONT, color: danoColor, fontStyle: 'bold',
        });
        this.add.text(168, Y_TOP + 38, resultado.abandono ? '⚠ Abandono por avería' : '✓ Finalizó la carrera', {
            fontSize: '12px', fontFamily: FONT, color: resultado.abandono ? '#ff4455' : '#4cdf80',
        });
    }

    // ── Stats grid ────────────────────────────────────────────────────────────
    private dibujarGridStats(resultado: ResultadoCarrera, estado: EstadoCarrera) {
        const Y0   = HEADER_H + 4 + 64;  // below hero cards
        const CARD_W = 75, CARD_H = 32, GAP = 2;

        const items: [string, string, string][] = [
            ['POSICIÓN',   `${resultado.posicionFinal}°`,          MEDALLA_COLOR[resultado.posicionFinal - 1] ?? '#5888a8'],
            ['PUNTOS',     `${resultado.puntosObtenidos}`,          '#ffcc00'],
            ['LLANTAS',    `${Math.round(estado.desgasteLlantas)}%`, estado.desgasteLlantas > 70 ? '#ff4455' : '#4cdf80'],
            ['MOTOR',      `${Math.round(estado.calorMotor)}°`,     estado.calorMotor > 80 ? '#ff4455' : '#4cdf80'],
        ];

        items.forEach(([label, value, vcolor], i) => {
            const col  = i % 2;
            const row  = Math.floor(i / 2);
            const x    = 4 + col * (CARD_W * 2 + GAP);
            const y    = Y0 + row * (CARD_H + GAP);
            const w    = CARD_W * 2;

            const g = this.add.graphics();
            g.fillStyle(COLOR.CARD_BG, 1);
            g.fillRoundedRect(x, y, w, CARD_H, 3);
            g.lineStyle(1, COLOR.CARD_BORDER, 0.5);
            g.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, CARD_H - 1, 3);

            this.add.text(x + 6, y + 4, label, estilos.cardLabel);
            this.add.text(x + 6, y + 16, value, {
                fontSize: '14px', fontFamily: FONT, color: vcolor, fontStyle: 'bold',
            });
        });
    }

    // ── Car health strip ──────────────────────────────────────────────────────
    private dibujarSaludCarro(estado: EstadoCarrera) {
        const Y0 = HEADER_H + 4 + 64 + 34 * 2 + 6;

        const items: [string, number, string][] = [
            ['LLANTAS',   100 - estado.desgasteLlantas, '#28b878'],
            ['MOTOR',     100 - Math.min(100, estado.calorMotor), '#8050e0'],
            ['COMBUSTIB', estado.combustible, '#e05828'],
            ['ESTRUCTURA', estado.durabilidadActual, '#7ab8e8'],
        ];

        const W_TOTAL = 312, BLOCK_W = W_TOTAL / 4;

        this.add.text(4, Y0 - 1, 'ESTADO DEL CARRO', estilos.cardLabel);

        items.forEach(([label, pct, color], i) => {
            const x    = 4 + i * BLOCK_W;
            const barW = Math.round((Math.max(0, Math.min(100, pct)) / 100) * (BLOCK_W - 8));

            this.add.text(x + 2, Y0 + 10, label, { fontSize: '7px', fontFamily: FONT, color: '#334455' });

            // Bar background
            const g = this.add.graphics();
            g.fillStyle(COLOR.CARD_BG_ALT, 1);
            g.fillRoundedRect(x + 2, Y0 + 18, BLOCK_W - 8, 6, 1);

            // Bar fill
            const fillColor = pct < 30 ? 0xff4455 : pct < 60 ? 0xffcc00 : parseInt(color.replace('#', ''), 16);
            g.fillStyle(fillColor, 1);
            if (barW > 0) g.fillRoundedRect(x + 2, Y0 + 18, barW, 6, 1);

            // Value text
            this.add.text(x + 2, Y0 + 26, `${Math.round(pct)}%`, {
                fontSize: '7px', fontFamily: FONT, color: '#4a7898',
            });
        });
    }

    // ── Button ────────────────────────────────────────────────────────────────
    private dibujarBoton() {
        const BH = 14;
        const g  = this.add.graphics();
        g.fillStyle(COLOR.BTN_GREEN, 1);
        g.fillRoundedRect(4, BTN_Y, 312, BH, 3);

        const zone = this.add.zone(4, BTN_Y, 312, BH).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => this.scene.start('TallerScene'));
        zone.on('pointerover', () => {
            g.clear();
            g.fillStyle(COLOR.BTN_GREEN_H, 1);
            g.fillRoundedRect(4, BTN_Y, 312, BH, 3);
        });
        zone.on('pointerout', () => {
            g.clear();
            g.fillStyle(COLOR.BTN_GREEN, 1);
            g.fillRoundedRect(4, BTN_Y, 312, BH, 3);
        });

        this.add.text(160, BTN_Y + 3, '◀  VOLVER AL TALLER', {
            fontSize: '12px', fontFamily: FONT, color: '#4cdf80', fontStyle: 'bold',
        }).setOrigin(0.5, 0);
    }
}
