import { Scene } from 'phaser';
import type { DatosResultadosScene, EstadoCarrera, ResultadoCarrera } from '../../types';
import { estilos, COLOR } from '../../utils/estilos';

const FONT = "'Open Sans', sans-serif";
const W    = 480;
const H    = 270;

const MEDALLA_LABEL = ['🥇 ORO', '🥈 PLATA', '🥉 BRONCE', '4°', '5°', '6°'];
const MEDALLA_COLOR = ['#ffcc00', '#cccccc', '#cc8833', '#7ab8e8', '#7ab8e8', '#5888a8'];

const HEADER_H = 18;
const BTN_Y    = 245;

export class ResultadosScene extends Scene {
    constructor() { super('ResultadosScene'); }

    init(datos: DatosResultadosScene) {
        this.registry.set('ultimoResultado', datos);
    }

    create() {
        const { resultado, estadoCarrera, nombreCircuito }: DatosResultadosScene =
            this.registry.get('ultimoResultado');

        this.dibujarFondo();
        this.dibujarHeader(resultado.abandono, nombreCircuito);
        this.dibujarHeroPosicion(resultado);
        this.dibujarGridStats(resultado, estadoCarrera);
        this.dibujarSaludCarro(estadoCarrera);
        this.dibujarBoton();
    }

    private dibujarFondo() {
        const g = this.add.graphics();
        g.fillStyle(COLOR.BG, 1);
        g.fillRect(0, 0, W, H);
        g.fillStyle(COLOR.STRIP_BG, 1);
        g.fillRect(0, BTN_Y - 3, W, H - BTN_Y + 3);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.4);
        g.lineBetween(0, BTN_Y - 3, W, BTN_Y - 3);
    }

    private dibujarHeader(abandono: boolean, nombreCircuito: string) {
        const g = this.add.graphics();
        g.fillStyle(COLOR.HEADER_BG, 1);
        g.fillRect(0, 0, W, HEADER_H);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.5);
        g.lineBetween(0, HEADER_H, W, HEADER_H);

        const titulo = abandono ? 'ABANDONO' : 'RESULTADO FINAL';
        const color  = abandono ? '#ff4455' : '#7ab8e8';
        this.add.text(5, 3, titulo, { fontSize: '9px', fontFamily: FONT, color, fontStyle: 'bold' });
        this.add.text(W - 5, 3, nombreCircuito, {
            fontSize: '9px', fontFamily: FONT, color: '#334455',
        }).setOrigin(1, 0);
    }

    private dibujarHeroPosicion(resultado: ResultadoCarrera) {
        const pos   = resultado.posicionFinal;
        const medal = MEDALLA_LABEL[pos - 1] ?? `${pos}°`;
        const color = MEDALLA_COLOR[pos - 1] ?? '#5888a8';
        const Y_TOP = HEADER_H + 6;

        const g = this.add.graphics();
        g.fillStyle(COLOR.CARD_BG, 1);
        g.fillRoundedRect(6, Y_TOP, 224, 80, 4);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.6);
        g.strokeRoundedRect(6.5, Y_TOP + 0.5, 223, 79, 4);

        this.add.text(16, Y_TOP + 10, medal, {
            fontSize: '20px', fontFamily: FONT, color, fontStyle: 'bold',
        });
        this.add.text(16, Y_TOP + 50, `${resultado.puntosObtenidos} puntos`, {
            fontSize: '9px', fontFamily: FONT, color: '#4a7898',
        });
        this.add.text(120, Y_TOP + 50, `${resultado.vueltasCompletadas} vueltas`, {
            fontSize: '9px', fontFamily: FONT, color: '#4a7898',
        });

        const g2 = this.add.graphics();
        g2.fillStyle(COLOR.CARD_BG, 1);
        g2.fillRoundedRect(236, Y_TOP, 238, 80, 4);
        g2.lineStyle(1, COLOR.CARD_BORDER, 0.6);
        g2.strokeRoundedRect(236.5, Y_TOP + 0.5, 237, 79, 4);

        this.add.text(246, Y_TOP + 8, 'DAÑO AL CARRO', estilos.cardLabel);
        const danoColor = resultado.danoRecibido > 60 ? '#ff4455' : resultado.danoRecibido > 30 ? '#ffcc00' : '#4cdf80';
        this.add.text(246, Y_TOP + 22, `${resultado.danoRecibido}%`, {
            fontSize: '18px', fontFamily: FONT, color: danoColor, fontStyle: 'bold',
        });
        this.add.text(246, Y_TOP + 56, resultado.abandono ? '⚠ Abandono por avería' : '✓ Finalizó la carrera', {
            fontSize: '9px', fontFamily: FONT, color: resultado.abandono ? '#ff4455' : '#4cdf80',
        });
    }

    private dibujarGridStats(resultado: ResultadoCarrera, estado: EstadoCarrera) {
        const Y0     = HEADER_H + 6 + 90;
        const CARD_W = 112;
        const CARD_H = 46;
        const GAP    = 3;

        const items: [string, string, string][] = [
            ['POSICIÓN', `${resultado.posicionFinal}°`,          MEDALLA_COLOR[resultado.posicionFinal - 1] ?? '#5888a8'],
            ['PUNTOS',   `${resultado.puntosObtenidos}`,          '#ffcc00'],
            ['LLANTAS',  `${Math.round(estado.desgasteLlantas)}%`, estado.desgasteLlantas > 70 ? '#ff4455' : '#4cdf80'],
            ['MOTOR',    `${Math.round(estado.calorMotor)}°`,     estado.calorMotor > 80 ? '#ff4455' : '#4cdf80'],
        ];

        items.forEach(([label, value, vcolor], i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x   = 6 + col * (CARD_W * 2 + GAP);
            const y   = Y0 + row * (CARD_H + GAP);
            const w   = CARD_W * 2;

            const g = this.add.graphics();
            g.fillStyle(COLOR.CARD_BG, 1);
            g.fillRoundedRect(x, y, w, CARD_H, 3);
            g.lineStyle(1, COLOR.CARD_BORDER, 0.5);
            g.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, CARD_H - 1, 3);

            this.add.text(x + 8, y + 6, label, estilos.cardLabel);
            this.add.text(x + 8, y + 20, value, {
                fontSize: '13px', fontFamily: FONT, color: vcolor, fontStyle: 'bold',
            });
        });
    }

    private dibujarSaludCarro(estado: EstadoCarrera) {
        const Y0 = HEADER_H + 6 + 90 + 100;

        const items: [string, number, string][] = [
            ['LLANTAS',    100 - estado.desgasteLlantas,            '#28b878'],
            ['MOTOR',      100 - Math.min(100, estado.calorMotor),  '#8050e0'],
            ['COMBUSTIB',  estado.combustible,                       '#e05828'],
            ['ESTRUCTURA', estado.durabilidadActual,                 '#7ab8e8'],
        ];

        const BLOCK_W = (W - 12) / 4;
        this.add.text(6, Y0 - 2, 'ESTADO DEL CARRO', estilos.cardLabel);

        items.forEach(([label, pct, color], i) => {
            const x    = 6 + i * BLOCK_W;
            const barW = Math.round((Math.max(0, Math.min(100, pct)) / 100) * (BLOCK_W - 10));

            this.add.text(x + 2, Y0 + 12, label, { fontSize: '7px', fontFamily: FONT, color: '#334455' });

            const g = this.add.graphics();
            g.fillStyle(COLOR.CARD_BG_ALT, 1);
            g.fillRoundedRect(x + 2, Y0 + 22, BLOCK_W - 10, 8, 1);

            const fillColor = pct < 30 ? 0xff4455 : pct < 60 ? 0xffcc00 : parseInt(color.replace('#', ''), 16);
            g.fillStyle(fillColor, 1);
            if (barW > 0) g.fillRoundedRect(x + 2, Y0 + 22, barW, 8, 1);

            this.add.text(x + 2, Y0 + 32, `${Math.round(pct)}%`, {
                fontSize: '7px', fontFamily: FONT, color: '#4a7898',
            });
        });
    }

    private dibujarBoton() {
        const BW = W - 12;
        const BH = 20;
        const g  = this.add.graphics();
        g.fillStyle(COLOR.BTN_GREEN, 1);
        g.fillRoundedRect(6, BTN_Y, BW, BH, 3);

        const zone = this.add.zone(6, BTN_Y, BW, BH).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => this.scene.start('TallerScene'));
        zone.on('pointerover', () => { g.clear(); g.fillStyle(COLOR.BTN_GREEN_H, 1); g.fillRoundedRect(6, BTN_Y, BW, BH, 3); });
        zone.on('pointerout',  () => { g.clear(); g.fillStyle(COLOR.BTN_GREEN, 1);   g.fillRoundedRect(6, BTN_Y, BW, BH, 3); });

        this.add.text(W / 2, BTN_Y + 5, '◀  VOLVER AL TALLER', {
            fontSize: '9px', fontFamily: FONT, color: '#4cdf80', fontStyle: 'bold',
        }).setOrigin(0.5, 0);
    }
}
