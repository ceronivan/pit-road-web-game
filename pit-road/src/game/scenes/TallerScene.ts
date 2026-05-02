import { Scene, GameObjects } from 'phaser';
import type { Pieza, CategoriaPieza, StatsCarro, DatosCarreraScene } from '../../types';
import piezasData from '../../data/piezas.json';
import { calcularStatsCarro, calcularRendimiento } from '../../systems/SimuladorCarrera';
import { estilos, COLOR } from '../../utils/estilos';

const FONT = "'Open Sans', sans-serif";

const CATEGORIAS: CategoriaPieza[] = ['motor', 'suspension', 'llantas', 'transmision', 'aerodinamica', 'electronica'];
const CAT_LABEL: Record<CategoriaPieza, string> = {
    motor: 'MOT', suspension: 'SUS', llantas: 'LLA',
    transmision: 'TRA', aerodinamica: 'AER', electronica: 'ELE',
};
const CAT_ICON: Record<CategoriaPieza, string> = {
    motor: '⚙', suspension: '〰', llantas: '◎', transmision: '⇄', aerodinamica: '▲', electronica: '⚡',
};
const COLOR_RAREZA: Record<string, number> = { comun: COLOR.COMUN, rara: COLOR.RARA, epica: COLOR.EPICA };
const PIEZAS_INICIALES = ['motor_01', 'suspension_01', 'llantas_01'];

// ── Layout ────────────────────────────────────────────────────────────────────
const HEADER_H  = 13;
const SLOT_X    = 4;
const SLOT_Y0   = HEADER_H + 3;
const SLOT_W    = 152;
const SLOT_H    = 24;
const SLOT_GAP  = 2;
const PANEL_X   = 162;
const PANEL_W   = 154;
const BARRA_W   = 140;
const BARRA_H   = 7;
const BTN_Y     = 163;

export class TallerScene extends Scene {
    private piezasEquipadas: Partial<Record<CategoriaPieza, Pieza>> = {};
    private todasPiezas: Pieza[] = [];
    private panelSelector?: GameObjects.Container;

    // Slot graphics & texts
    private slotGraphics: GameObjects.Graphics[] = [];
    private slotNombres:  GameObjects.Text[]     = [];

    // Stats bars
    private gfxBars!:    GameObjects.Graphics;
    private barraAccel!: GameObjects.Rectangle;
    private barraSpeed!: GameObjects.Rectangle;
    private barraHandl!: GameObjects.Rectangle;
    private lblAccel!:   GameObjects.Text;
    private lblSpeed!:   GameObjects.Text;
    private lblHandl!:   GameObjects.Text;
    private lblRend!:    GameObjects.Text;

    constructor() { super('TallerScene'); }

    // ── Create ────────────────────────────────────────────────────────────────
    create() {
        this.todasPiezas = piezasData as Pieza[];
        PIEZAS_INICIALES.forEach(id => {
            const p = this.todasPiezas.find(x => x.id === id);
            if (p) this.piezasEquipadas[p.categoria] = p;
        });

        this.dibujarFondo();
        this.dibujarHeader();
        this.dibujarSlots();
        this.dibujarPanelStats();
        this.dibujarBotonCarrera();
        this.actualizarStatsUI();
    }

    // ── Background ────────────────────────────────────────────────────────────
    private dibujarFondo() {
        const g = this.add.graphics();
        g.fillStyle(COLOR.BG, 1);
        g.fillRect(0, 0, 320, 180);

        // Divider between slots and stats panels
        g.lineStyle(1, COLOR.CARD_BORDER, 0.4);
        g.lineBetween(PANEL_X - 4, HEADER_H, PANEL_X - 4, 160);

        // Bottom button area
        g.fillStyle(COLOR.STRIP_BG, 1);
        g.fillRect(0, BTN_Y - 2, 320, 180 - BTN_Y + 2);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.4);
        g.lineBetween(0, BTN_Y - 2, 320, BTN_Y - 2);
    }

    // ── Header ────────────────────────────────────────────────────────────────
    private dibujarHeader() {
        const g = this.add.graphics();
        g.fillStyle(COLOR.HEADER_BG, 1);
        g.fillRect(0, 0, 320, HEADER_H);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.5);
        g.lineBetween(0, HEADER_H, 320, HEADER_H);

        this.add.text(4, 2, 'TALLER', { fontSize: '12px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold' });
        this.add.text(PANEL_X, 2, 'ESTADÍSTICAS', { fontSize: '12px', fontFamily: FONT, color: '#5888a8' });
    }

    // ── Equipment slots ───────────────────────────────────────────────────────
    private dibujarSlots() {
        CATEGORIAS.forEach((cat, i) => {
            const y  = SLOT_Y0 + i * (SLOT_H + SLOT_GAP);
            const g  = this.add.graphics();
            this.slotGraphics.push(g);

            // Category label (fixed)
            this.add.text(SLOT_X + 3, y + 7, `${CAT_ICON[cat]} ${CAT_LABEL[cat]}`, {
                fontSize: '12px', fontFamily: FONT, color: '#4a7898',
            });

            // Piece name (dynamic)
            const nombre = this.add.text(SLOT_X + 35, y + 7, '— vacío —', {
                fontSize: '12px', fontFamily: FONT, color: '#334455',
            });
            this.slotNombres.push(nombre);

            // Interactive zone
            const zone = this.add.zone(SLOT_X, y, SLOT_W, SLOT_H).setOrigin(0, 0).setInteractive({ useHandCursor: true });
            zone.on('pointerdown', () => this.abrirSelector(cat));
            zone.on('pointerover', () => this.resaltarSlot(i, true));
            zone.on('pointerout',  () => this.resaltarSlot(i, false));
        });

        this.actualizarSlots();
    }

    private resaltarSlot(idx: number, hover: boolean) {
        const cat   = CATEGORIAS[idx];
        const pieza = this.piezasEquipadas[cat];
        const y     = SLOT_Y0 + idx * (SLOT_H + SLOT_GAP);
        const g     = this.slotGraphics[idx];
        const rarColor = pieza ? COLOR_RAREZA[pieza.rareza] : COLOR.CARD_BORDER;

        g.clear();
        g.fillStyle(hover ? 0x0f1e30 : COLOR.CARD_BG, 1);
        g.fillRoundedRect(SLOT_X, y, SLOT_W, SLOT_H, 3);
        g.lineStyle(1, rarColor, pieza ? (hover ? 0.9 : 0.5) : (hover ? 0.4 : 0.15));
        g.strokeRoundedRect(SLOT_X + 0.5, y + 0.5, SLOT_W - 1, SLOT_H - 1, 3);
    }

    private actualizarSlots() {
        CATEGORIAS.forEach((cat, i) => {
            const pieza = this.piezasEquipadas[cat];
            this.slotNombres[i].setText(pieza ? pieza.nombre : '— vacío —')
                .setColor(pieza ? '#d0e8ff' : '#334455');
            this.resaltarSlot(i, false);
        });
    }

    // ── Stats panel ───────────────────────────────────────────────────────────
    private dibujarPanelStats() {
        const x  = PANEL_X;
        const y0 = HEADER_H + 4;
        const dy = 38;

        this.gfxBars = this.add.graphics();

        const bars: [string, number, number][] = [
            ['ACCEL', COLOR.ACCEL, y0],
            ['SPEED', COLOR.SPEED, y0 + dy],
            ['HANDL', COLOR.HANDL, y0 + dy * 2],
        ];

        bars.forEach(([label, color, y]) => {
            this.add.text(x, y, label, estilos.cardLabel);
            // Background bar
            this.gfxBars.fillStyle(COLOR.CARD_BG_ALT, 1);
            this.gfxBars.fillRoundedRect(x, y + 13, BARRA_W, BARRA_H, 2);
        });

        // ACCEL bar
        this.barraAccel = this.add.rectangle(x, y0 + 13, 0, BARRA_H, COLOR.ACCEL).setOrigin(0, 0);
        this.lblAccel   = this.add.text(x + BARRA_W + 3, y0 + 13, '0', {
            fontSize: '12px', fontFamily: FONT, color: '#e05828',
        });

        // SPEED bar
        this.barraSpeed = this.add.rectangle(x, y0 + dy + 13, 0, BARRA_H, COLOR.SPEED).setOrigin(0, 0);
        this.lblSpeed   = this.add.text(x + BARRA_W + 3, y0 + dy + 13, '0', {
            fontSize: '12px', fontFamily: FONT, color: '#8050e0',
        });

        // HANDL bar
        this.barraHandl = this.add.rectangle(x, y0 + dy * 2 + 13, 0, BARRA_H, COLOR.HANDL).setOrigin(0, 0);
        this.lblHandl   = this.add.text(x + BARRA_W + 3, y0 + dy * 2 + 13, '0', {
            fontSize: '12px', fontFamily: FONT, color: '#28b878',
        });

        // Rendimiento total card
        const ry = y0 + dy * 3 + 2;
        const sepG = this.add.graphics();
        sepG.lineStyle(1, COLOR.CARD_BORDER, 0.5);
        sepG.lineBetween(x, ry - 4, x + PANEL_W, ry - 4);

        this.add.text(x, ry, 'RENDIMIENTO', estilos.cardLabel);
        this.lblRend = this.add.text(x + 70, ry - 2, '—', {
            fontSize: '16px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold',
        });
    }

    private actualizarStatsUI() {
        const stats = calcularStatsCarro(this.piezasEquipadas);
        const rend  = Math.round(calcularRendimiento(stats));

        const setBar = (bar: GameObjects.Rectangle, val: number) =>
            bar.setSize(Math.round((val / 100) * BARRA_W), BARRA_H);

        setBar(this.barraAccel, stats.acceleration);
        setBar(this.barraSpeed, stats.topSpeed);
        setBar(this.barraHandl, stats.handling);

        this.lblAccel.setText(`${stats.acceleration}`);
        this.lblSpeed.setText(`${stats.topSpeed}`);
        this.lblHandl.setText(`${stats.handling}`);

        const rendColor = rend >= 70 ? '#4cdf80' : rend >= 50 ? '#ffcc00' : '#ff4455';
        this.lblRend.setText(`${rend}`).setColor(rendColor);
    }

    // ── Piece selector ────────────────────────────────────────────────────────
    private abrirSelector(categoria: CategoriaPieza) {
        this.panelSelector?.destroy();
        const piezas = this.todasPiezas.filter(p => p.categoria === categoria);
        const ITEM_H = 22, POPUP_W = 152, POPUP_H = 16 + piezas.length * (ITEM_H + 2) + 4;

        // Position to the right of the slot column
        const c = this.add.container(SLOT_X + SLOT_W + 4, 80);

        const g = this.add.graphics();
        g.fillStyle(0x060e1a, 0.98);
        g.fillRoundedRect(0, 0, POPUP_W, POPUP_H, 4);
        g.lineStyle(1, COLOR.SECTOR_S2, 0.7);
        g.strokeRoundedRect(0.5, 0.5, POPUP_W - 1, POPUP_H - 1, 4);
        c.add(g);

        c.add(this.add.text(6, 4, `ELIGE  ${CAT_LABEL[categoria]}`, estilos.subtitulo));
        const cerrar = this.add.text(POPUP_W - 14, 3, '✕', {
            fontSize: '12px', fontFamily: FONT, color: '#ff4455',
        }).setInteractive({ useHandCursor: true }).on('pointerdown', () => c.destroy());
        c.add(cerrar);

        piezas.forEach((p, i) => {
            const y      = 16 + i * (ITEM_H + 2);
            const rarCol = COLOR_RAREZA[p.rareza];
            const rarHex = `#${rarCol.toString(16).padStart(6, '0')}`;
            const rarStr = p.rareza === 'comun' ? 'C' : p.rareza === 'rara' ? 'R' : 'E';

            const itemBg = this.add.graphics();
            itemBg.fillStyle(COLOR.CARD_BG, 1);
            itemBg.fillRoundedRect(2, y, POPUP_W - 4, ITEM_H, 2);
            itemBg.lineStyle(1, rarCol, 0.3);
            itemBg.strokeRoundedRect(2.5, y + 0.5, POPUP_W - 5, ITEM_H - 1, 2);
            c.add(itemBg);

            const zone = this.add.zone(2, y, POPUP_W - 4, ITEM_H).setOrigin(0, 0).setInteractive({ useHandCursor: true });
            zone.on('pointerdown', () => {
                this.piezasEquipadas[categoria] = p;
                this.actualizarSlots();
                this.actualizarStatsUI();
                c.destroy();
            });
            zone.on('pointerover', () => {
                itemBg.clear();
                itemBg.fillStyle(0x0f2238, 1);
                itemBg.fillRoundedRect(2, y, POPUP_W - 4, ITEM_H, 2);
                itemBg.lineStyle(1, rarCol, 0.7);
                itemBg.strokeRoundedRect(2.5, y + 0.5, POPUP_W - 5, ITEM_H - 1, 2);
            });
            zone.on('pointerout', () => {
                itemBg.clear();
                itemBg.fillStyle(COLOR.CARD_BG, 1);
                itemBg.fillRoundedRect(2, y, POPUP_W - 4, ITEM_H, 2);
                itemBg.lineStyle(1, rarCol, 0.3);
                itemBg.strokeRoundedRect(2.5, y + 0.5, POPUP_W - 5, ITEM_H - 1, 2);
            });

            c.add(this.add.text(6, y + 5, p.nombre, { fontSize: '12px', fontFamily: FONT, color: '#d0e8ff' }));
            c.add(this.add.text(POPUP_W - 14, y + 5, rarStr, { fontSize: '12px', fontFamily: FONT, color: rarHex, fontStyle: 'bold' }));
            c.add(zone);
        });

        this.panelSelector = c;
    }

    // ── Race button ───────────────────────────────────────────────────────────
    private dibujarBotonCarrera() {
        const BH = 14;
        const g  = this.add.graphics();
        g.fillStyle(COLOR.BTN_GREEN, 1);
        g.fillRoundedRect(4, BTN_Y, 312, BH, 3);

        const zone = this.add.zone(4, BTN_Y, 312, BH).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => this.irACarrera());
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

        this.add.text(160, BTN_Y + 3, '▶  IR A CARRERA', {
            fontSize: '12px', fontFamily: FONT, color: '#4cdf80', fontStyle: 'bold',
        }).setOrigin(0.5, 0);
    }

    private irACarrera() {
        const stats = calcularStatsCarro(this.piezasEquipadas);
        const datos: DatosCarreraScene = { carro: { piezas: this.piezasEquipadas, stats } };
        this.scene.start('CarreraScene', datos);
    }
}
