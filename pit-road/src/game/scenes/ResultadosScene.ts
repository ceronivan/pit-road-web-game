import { Scene, GameObjects } from 'phaser';
import type { DatosResultadosScene, EstadoCarrera, ResultadoCarrera } from '../../types';
import { estilos, COLOR } from '../../utils/estilos';

const FONT = "'Open Sans', sans-serif";

// Posición → etiqueta limpia (sin emoji)
const POS_LABEL = ['CAMPEÓN',   '2° LUGAR',  '3° LUGAR',  '4° PUESTO', '5° PUESTO',  '6° PUESTO'];
const POS_COLOR = ['#ffcc00',   '#c8c8c8',   '#cd7f32',   '#7ab8e8',   '#7ab8e8',    '#5888a8'];

// ── Layout (960×540) ──────────────────────────────────────────────────────────
const HEADER_H = 44;
const HERO_Y   = 54;
const HERO_H   = 160;
const GRID_Y   = HERO_Y + HERO_H + 14;             // 228
const GRID_ROW = 72;
const GRID_GAP = 8;
const HEALTH_Y = GRID_Y + GRID_ROW * 2 + GRID_GAP + 12;  // 392
const BTN_Y    = HEALTH_Y + 68 + 12;               // 472
const BTN_H    = 48;

const SIDE_PAD = 16;
const MID_GAP  = 16;
const HALF_W   = Math.floor((960 - SIDE_PAD * 2 - MID_GAP) / 2);  // 456

export class ResultadosScene extends Scene {
    constructor() { super('ResultadosScene'); }

    init(datos: DatosResultadosScene) {
        this.registry.set('ultimoResultado', datos);
    }

    create() {
        const { resultado, estadoCarrera }: DatosResultadosScene =
            this.registry.get('ultimoResultado');

        this.dibujarFondo();
        this.dibujarHeader(resultado.abandono);
        this.dibujarHeroCards(resultado);
        this.dibujarGridStats(resultado, estadoCarrera);
        this.dibujarSaludCarro(estadoCarrera);
        this.dibujarBoton();
    }

    // ── Fondo ─────────────────────────────────────────────────────────────────
    private dibujarFondo() {
        const g = this.add.graphics();
        g.fillStyle(COLOR.BG, 1);
        g.fillRect(0, 0, 960, 540);

        g.fillStyle(COLOR.STRIP_BG, 1);
        g.fillRect(0, BTN_Y - 2, 960, 540 - BTN_Y + 2);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.4);
        g.lineBetween(0, BTN_Y - 2, 960, BTN_Y - 2);
    }

    // ── Header ────────────────────────────────────────────────────────────────
    private dibujarHeader(abandono: boolean) {
        const g = this.add.graphics();
        g.fillStyle(COLOR.HEADER_BG, 1);
        g.fillRect(0, 0, 960, HEADER_H);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.5);
        g.lineBetween(0, HEADER_H, 960, HEADER_H);

        const titulo = abandono ? 'ABANDONO' : 'RESULTADO FINAL';
        const color  = abandono ? '#ff4455' : '#7ab8e8';
        this.add.text(16, 13, titulo, { fontSize: '15px', fontFamily: FONT, color, fontStyle: 'bold' });
        this.add.text(940, 13, 'Circuito Alfa', estilos.muted).setOrigin(1, 0);
    }

    // ── Tarjetas hero ─────────────────────────────────────────────────────────
    private dibujarHeroCards(resultado: ResultadoCarrera) {
        const pos   = resultado.posicionFinal;
        const medal = POS_LABEL[pos - 1] ?? `${pos}° PUESTO`;
        const color = POS_COLOR[pos - 1] ?? '#5888a8';
        const CW    = HALF_W;

        // ── Tarjeta izquierda: posición ──────────────────────────────────────
        const CX1 = SIDE_PAD;
        const g1 = this.add.graphics();
        g1.fillStyle(COLOR.CARD_BG, 1);
        g1.fillRoundedRect(CX1, HERO_Y, CW, HERO_H, 6);
        g1.lineStyle(1, COLOR.CARD_BORDER, 0.6);
        g1.strokeRoundedRect(CX1 + 0.5, HERO_Y + 0.5, CW - 1, HERO_H - 1, 6);

        // Número grande de posición
        this.add.text(CX1 + 24, HERO_Y + 16, `P${pos}`, {
            fontSize: '48px', fontFamily: FONT, color, fontStyle: 'bold',
        });

        // Etiqueta de posición
        this.add.text(CX1 + 112, HERO_Y + 30, medal, {
            fontSize: '18px', fontFamily: FONT, color, fontStyle: 'bold',
        });

        // Puntos
        this.add.text(CX1 + 24, HERO_Y + 96, 'PUNTOS OBTENIDOS', estilos.cardLabel);
        this.add.text(CX1 + 24, HERO_Y + 112, `${resultado.puntosObtenidos}`, {
            fontSize: '24px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold',
        });

        // Vueltas
        this.add.text(CX1 + 210, HERO_Y + 96, 'VUELTAS', estilos.cardLabel);
        this.add.text(CX1 + 210, HERO_Y + 112, `${resultado.vueltasCompletadas} / 20`, {
            fontSize: '18px', fontFamily: FONT, color: '#d0e8ff', fontStyle: 'bold',
        });

        // ── Tarjeta derecha: daño al carro ───────────────────────────────────
        const CX2 = SIDE_PAD + HALF_W + MID_GAP;
        const g2 = this.add.graphics();
        g2.fillStyle(COLOR.CARD_BG, 1);
        g2.fillRoundedRect(CX2, HERO_Y, CW, HERO_H, 6);
        g2.lineStyle(1, COLOR.CARD_BORDER, 0.6);
        g2.strokeRoundedRect(CX2 + 0.5, HERO_Y + 0.5, CW - 1, HERO_H - 1, 6);

        this.add.text(CX2 + 24, HERO_Y + 16, 'DAÑO RECIBIDO', estilos.cardLabel);

        const dano      = resultado.danoRecibido;
        const danoColor = dano > 60 ? '#ff4455' : dano > 30 ? '#ffcc00' : '#4cdf80';
        this.add.text(CX2 + 24, HERO_Y + 32, `${dano}%`, {
            fontSize: '48px', fontFamily: FONT, color: danoColor, fontStyle: 'bold',
        });

        // Barra de daño
        const barW   = CW - 48;
        const fillW  = Math.round(Math.max(0, Math.min(100, dano)) / 100 * barW);
        const barG   = this.add.graphics();
        barG.fillStyle(COLOR.CARD_BG_ALT, 1);
        barG.fillRoundedRect(CX2 + 24, HERO_Y + 108, barW, 10, 3);
        if (fillW > 0) {
            barG.fillStyle(parseInt(danoColor.replace('#', ''), 16), 1);
            barG.fillRoundedRect(CX2 + 24, HERO_Y + 108, fillW, 10, 3);
        }

        const estadoStr = resultado.abandono ? 'Abandonó la carrera' : 'Carrera completada';
        const estadoCol = resultado.abandono ? '#ff4455' : '#4cdf80';
        this.add.text(CX2 + 24, HERO_Y + 128, estadoStr, {
            fontSize: '13px', fontFamily: FONT, color: estadoCol, fontStyle: 'bold',
        });
    }

    // ── Grid de estadísticas (2×2) ────────────────────────────────────────────
    private dibujarGridStats(resultado: ResultadoCarrera, estado: EstadoCarrera) {
        const cardW = HALF_W;
        const items: [string, string, string][] = [
            ['POSICIÓN FINAL',    `${resultado.posicionFinal}°`,            POS_COLOR[resultado.posicionFinal - 1] ?? '#5888a8'],
            ['PUNTOS',            `${resultado.puntosObtenidos} pts`,       '#ffcc00'],
            ['DESGASTE LLANTAS',  `${Math.round(estado.desgasteLlantas)}%`, estado.desgasteLlantas > 70 ? '#ff4455' : '#4cdf80'],
            ['TEMPERATURA MOTOR', `${Math.round(estado.calorMotor)}%`,      estado.calorMotor > 80       ? '#ff4455' : '#4cdf80'],
        ];

        items.forEach(([label, value, vcolor], i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x   = SIDE_PAD + col * (cardW + MID_GAP);
            const y   = GRID_Y + row * (GRID_ROW + GRID_GAP);

            const g = this.add.graphics();
            g.fillStyle(COLOR.CARD_BG, 1);
            g.fillRoundedRect(x, y, cardW, GRID_ROW, 4);
            g.lineStyle(1, COLOR.CARD_BORDER, 0.5);
            g.strokeRoundedRect(x + 0.5, y + 0.5, cardW - 1, GRID_ROW - 1, 4);

            this.add.text(x + 16, y + 10, label, estilos.cardLabel);
            this.add.text(x + 16, y + 30, value, {
                fontSize: '18px', fontFamily: FONT, color: vcolor, fontStyle: 'bold',
            });
        });
    }

    // ── Franja de salud del carro ─────────────────────────────────────────────
    private dibujarSaludCarro(estado: EstadoCarrera) {
        this.add.text(SIDE_PAD, HEALTH_Y, 'ESTADO DEL CARRO AL FINALIZAR', estilos.cardLabel);

        const BLOCK_W = (960 - SIDE_PAD * 2) / 4;

        const items: [string, number, number][] = [
            ['LLANTAS',     100 - estado.desgasteLlantas,           0x28b878],
            ['MOTOR',       100 - Math.min(100, estado.calorMotor), 0x8050e0],
            ['COMBUSTIBLE', estado.combustible,                     0xe05828],
            ['ESTRUCTURA',  estado.durabilidadActual,               0x7ab8e8],
        ];

        items.forEach(([label, pct, baseColor], i) => {
            const x    = SIDE_PAD + i * BLOCK_W;
            const barW = Math.round(Math.max(0, Math.min(100, pct)) / 100 * (BLOCK_W - 16));

            this.add.text(x, HEALTH_Y + 16, label, {
                fontSize: '11px', fontFamily: FONT, color: '#4a7898',
            });

            const g = this.add.graphics();
            g.fillStyle(COLOR.CARD_BG_ALT, 1);
            g.fillRoundedRect(x, HEALTH_Y + 32, BLOCK_W - 16, 10, 2);

            const fillColor = pct < 30 ? 0xff4455 : pct < 60 ? 0xffcc00 : baseColor;
            if (barW > 0) {
                g.fillStyle(fillColor, 1);
                g.fillRoundedRect(x, HEALTH_Y + 32, barW, 10, 2);
            }

            this.add.text(x, HEALTH_Y + 48, `${Math.round(pct)}%`, {
                fontSize: '11px', fontFamily: FONT, color: '#5888a8',
            });
        });
    }

    // ── Botón volver ──────────────────────────────────────────────────────────
    private dibujarBoton() {
        const BX = SIDE_PAD, BW = 960 - SIDE_PAD * 2, BY = BTN_Y + 8;

        const g = this.add.graphics();
        g.fillStyle(COLOR.BTN_GREEN, 1);
        g.fillRoundedRect(BX, BY, BW, BTN_H, 6);

        const zone = this.add.zone(BX, BY, BW, BTN_H)
            .setOrigin(0, 0).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => this.scene.start('TallerScene'));
        zone.on('pointerover', () => {
            g.clear(); g.fillStyle(COLOR.BTN_GREEN_H, 1); g.fillRoundedRect(BX, BY, BW, BTN_H, 6);
        });
        zone.on('pointerout', () => {
            g.clear(); g.fillStyle(COLOR.BTN_GREEN, 1); g.fillRoundedRect(BX, BY, BW, BTN_H, 6);
        });

        this.add.text(480, BY + BTN_H / 2, 'VOLVER AL TALLER', {
            fontSize: '15px', fontFamily: FONT, color: '#4cdf80', fontStyle: 'bold',
        }).setOrigin(0.5, 0.5);
    }
}
