import { Scene, GameObjects } from 'phaser';
import type { Pieza, CategoriaPieza, DatosCarreraScene } from '../../types';
import piezasData from '../../data/piezas.json';
import { calcularStatsCarro, calcularRendimiento } from '../../systems/SimuladorCarrera';
import { listarCircuitos } from '../../systems/CircuitoBuilder';
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

// ── Layout (480×270 canvas) ───────────────────────────────────────────────────
const W        = 480;
const H        = 270;
const HEADER_H = 18;
const SLOT_X   = 6;
const SLOT_Y0  = HEADER_H + 4;
const SLOT_W   = 228;
const SLOT_H   = 33;
const SLOT_GAP = 2;
const PANEL_X  = SLOT_X + SLOT_W + 8;
const PANEL_W  = W - PANEL_X - 6;
const BARRA_W  = PANEL_W - 30;
const BARRA_H  = 8;
const CIRC_Y   = SLOT_Y0 + 6 * (SLOT_H + SLOT_GAP) + 4;  // circuit selector y
const BTN_Y    = CIRC_Y + 16;                              // race button y

export class TallerScene extends Scene {
    private piezasEquipadas: Partial<Record<CategoriaPieza, Pieza>> = {};
    private todasPiezas: Pieza[] = [];
    private panelSelector?: GameObjects.Container;

    private circuitos: { id: string; nombre: string }[] = [];
    private circuitoIdx = 0;
    private lblCircuito!: GameObjects.Text;

    private slotGraphics: GameObjects.Graphics[] = [];
    private slotNombres:  GameObjects.Text[]     = [];

    private gfxBars!:    GameObjects.Graphics;
    private barraAccel!: GameObjects.Rectangle;
    private barraSpeed!: GameObjects.Rectangle;
    private barraHandl!: GameObjects.Rectangle;
    private lblAccel!:   GameObjects.Text;
    private lblSpeed!:   GameObjects.Text;
    private lblHandl!:   GameObjects.Text;
    private lblRend!:    GameObjects.Text;

    constructor() { super('TallerScene'); }

    create() {
        this.todasPiezas = piezasData as Pieza[];
        this.circuitos   = listarCircuitos();
        PIEZAS_INICIALES.forEach(id => {
            const p = this.todasPiezas.find(x => x.id === id);
            if (p) this.piezasEquipadas[p.categoria] = p;
        });

        this.dibujarFondo();
        this.dibujarHeader();
        this.dibujarSlots();
        this.dibujarPanelStats();
        this.dibujarSelectorCircuito();
        this.dibujarBotonCarrera();
        this.actualizarStatsUI();
    }

    private dibujarFondo() {
        const g = this.add.graphics();
        g.fillStyle(COLOR.BG, 1);
        g.fillRect(0, 0, W, H);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.4);
        g.lineBetween(PANEL_X - 5, HEADER_H, PANEL_X - 5, BTN_Y - 4);
        g.fillStyle(COLOR.STRIP_BG, 1);
        g.fillRect(0, BTN_Y - 3, W, H - BTN_Y + 3);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.4);
        g.lineBetween(0, BTN_Y - 3, W, BTN_Y - 3);
    }

    private dibujarHeader() {
        const g = this.add.graphics();
        g.fillStyle(COLOR.HEADER_BG, 1);
        g.fillRect(0, 0, W, HEADER_H);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.5);
        g.lineBetween(0, HEADER_H, W, HEADER_H);
        this.add.text(5, 3, 'TALLER', { fontSize: '9px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold' });
        this.add.text(PANEL_X, 3, 'ESTADÍSTICAS', { fontSize: '9px', fontFamily: FONT, color: '#5888a8' });
    }

    private dibujarSlots() {
        CATEGORIAS.forEach((cat, i) => {
            const y = SLOT_Y0 + i * (SLOT_H + SLOT_GAP);
            const g = this.add.graphics();
            this.slotGraphics.push(g);

            this.add.text(SLOT_X + 4, y + 10, `${CAT_ICON[cat]} ${CAT_LABEL[cat]}`, {
                fontSize: '9px', fontFamily: FONT, color: '#4a7898',
            });

            const nombre = this.add.text(SLOT_X + 48, y + 10, '— vacío —', {
                fontSize: '9px', fontFamily: FONT, color: '#334455',
            });
            this.slotNombres.push(nombre);

            const zone = this.add.zone(SLOT_X, y, SLOT_W, SLOT_H).setOrigin(0, 0).setInteractive({ useHandCursor: true });
            zone.on('pointerdown', () => this.abrirSelector(cat));
            zone.on('pointerover',  () => this.resaltarSlot(i, true));
            zone.on('pointerout',   () => this.resaltarSlot(i, false));
        });
        this.actualizarSlots();
    }

    private resaltarSlot(idx: number, hover: boolean) {
        const cat      = CATEGORIAS[idx];
        const pieza    = this.piezasEquipadas[cat];
        const y        = SLOT_Y0 + idx * (SLOT_H + SLOT_GAP);
        const g        = this.slotGraphics[idx];
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

    private dibujarPanelStats() {
        const x  = PANEL_X;
        const y0 = HEADER_H + 6;
        const dy = 54;

        this.gfxBars = this.add.graphics();

        const bars: [string, number, number][] = [
            ['ACCEL', COLOR.ACCEL, y0],
            ['SPEED', COLOR.SPEED, y0 + dy],
            ['HANDL', COLOR.HANDL, y0 + dy * 2],
        ];

        bars.forEach(([label, , y]) => {
            this.add.text(x, y, label, estilos.cardLabel);
            this.gfxBars.fillStyle(COLOR.CARD_BG_ALT, 1);
            this.gfxBars.fillRoundedRect(x, y + 16, BARRA_W, BARRA_H, 2);
        });

        this.barraAccel = this.add.rectangle(x, y0 + 16, 0, BARRA_H, COLOR.ACCEL).setOrigin(0, 0);
        this.lblAccel   = this.add.text(x + BARRA_W + 3, y0 + 16, '0', { fontSize: '9px', fontFamily: FONT, color: '#e05828' });

        this.barraSpeed = this.add.rectangle(x, y0 + dy + 16, 0, BARRA_H, COLOR.SPEED).setOrigin(0, 0);
        this.lblSpeed   = this.add.text(x + BARRA_W + 3, y0 + dy + 16, '0', { fontSize: '9px', fontFamily: FONT, color: '#8050e0' });

        this.barraHandl = this.add.rectangle(x, y0 + dy * 2 + 16, 0, BARRA_H, COLOR.HANDL).setOrigin(0, 0);
        this.lblHandl   = this.add.text(x + BARRA_W + 3, y0 + dy * 2 + 16, '0', { fontSize: '9px', fontFamily: FONT, color: '#28b878' });

        const ry  = y0 + dy * 3 + 4;
        const sg  = this.add.graphics();
        sg.lineStyle(1, COLOR.CARD_BORDER, 0.5);
        sg.lineBetween(x, ry - 5, x + PANEL_W, ry - 5);
        this.add.text(x, ry, 'RENDIMIENTO', estilos.cardLabel);
        this.lblRend = this.add.text(x + 100, ry - 2, '—', {
            fontSize: '13px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold',
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

    // ── Circuit selector ──────────────────────────────────────────────────────
    private dibujarSelectorCircuito() {
        const y  = CIRC_Y;
        const g  = this.add.graphics();
        g.fillStyle(COLOR.CARD_BG, 1);
        g.fillRoundedRect(SLOT_X, y, SLOT_W, 14, 2);

        this.add.text(SLOT_X + 6, y + 2, 'CIRCUITO:', {
            fontSize: '8px', fontFamily: FONT, color: '#4a7898',
        });

        this.lblCircuito = this.add.text(SLOT_X + 70, y + 2, this.circuitos[0]?.nombre ?? '', {
            fontSize: '8px', fontFamily: FONT, color: '#d0e8ff', fontStyle: 'bold',
        });

        const btnNext = this.add.text(SLOT_X + SLOT_W - 18, y + 2, '▶', {
            fontSize: '8px', fontFamily: FONT, color: '#7ab8e8',
        }).setInteractive({ useHandCursor: true });
        btnNext.on('pointerdown', () => this.ciclarCircuito(1));

        const btnPrev = this.add.text(SLOT_X + SLOT_W - 32, y + 2, '◀', {
            fontSize: '8px', fontFamily: FONT, color: '#7ab8e8',
        }).setInteractive({ useHandCursor: true });
        btnPrev.on('pointerdown', () => this.ciclarCircuito(-1));
    }

    private ciclarCircuito(delta: 1 | -1) {
        const n = this.circuitos.length;
        this.circuitoIdx = ((this.circuitoIdx + delta) % n + n) % n;
        this.lblCircuito.setText(this.circuitos[this.circuitoIdx].nombre);
    }

    // ── Piece selector ────────────────────────────────────────────────────────
    private abrirSelector(categoria: CategoriaPieza) {
        this.panelSelector?.destroy();
        const piezas  = this.todasPiezas.filter(p => p.categoria === categoria);
        const ITEM_H  = 28;
        const POPUP_W = 228;
        const POPUP_H = 18 + piezas.length * (ITEM_H + 2) + 4;

        const c = this.add.container(SLOT_X + SLOT_W + 6, 80);

        const g = this.add.graphics();
        g.fillStyle(0x060e1a, 0.98);
        g.fillRoundedRect(0, 0, POPUP_W, POPUP_H, 4);
        g.lineStyle(1, COLOR.SECTOR_S2, 0.7);
        g.strokeRoundedRect(0.5, 0.5, POPUP_W - 1, POPUP_H - 1, 4);
        c.add(g);

        c.add(this.add.text(6, 4, `ELIGE  ${CAT_LABEL[categoria]}`, estilos.subtitulo));
        const cerrar = this.add.text(POPUP_W - 16, 4, '✕', {
            fontSize: '9px', fontFamily: FONT, color: '#ff4455',
        }).setInteractive({ useHandCursor: true }).on('pointerdown', () => c.destroy());
        c.add(cerrar);

        piezas.forEach((p, i) => {
            const y      = 18 + i * (ITEM_H + 2);
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
            zone.on('pointerover', () => { itemBg.clear(); itemBg.fillStyle(0x0f2238, 1); itemBg.fillRoundedRect(2, y, POPUP_W - 4, ITEM_H, 2); itemBg.lineStyle(1, rarCol, 0.7); itemBg.strokeRoundedRect(2.5, y + 0.5, POPUP_W - 5, ITEM_H - 1, 2); });
            zone.on('pointerout',  () => { itemBg.clear(); itemBg.fillStyle(COLOR.CARD_BG, 1); itemBg.fillRoundedRect(2, y, POPUP_W - 4, ITEM_H, 2); itemBg.lineStyle(1, rarCol, 0.3); itemBg.strokeRoundedRect(2.5, y + 0.5, POPUP_W - 5, ITEM_H - 1, 2); });

            c.add(this.add.text(6, y + 8, p.nombre, { fontSize: '9px', fontFamily: FONT, color: '#d0e8ff' }));
            c.add(this.add.text(POPUP_W - 16, y + 8, rarStr, { fontSize: '9px', fontFamily: FONT, color: rarHex, fontStyle: 'bold' }));
            c.add(zone);
        });

        this.panelSelector = c;
    }

    // ── Race button ───────────────────────────────────────────────────────────
    private dibujarBotonCarrera() {
        const BH = 20;
        const g  = this.add.graphics();
        g.fillStyle(COLOR.BTN_GREEN, 1);
        g.fillRoundedRect(SLOT_X, BTN_Y, SLOT_W + PANEL_W + 3, BH, 3);

        const zone = this.add.zone(SLOT_X, BTN_Y, SLOT_W + PANEL_W + 3, BH).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => this.irACarrera());
        zone.on('pointerover', () => {
            g.clear(); g.fillStyle(COLOR.BTN_GREEN_H, 1);
            g.fillRoundedRect(SLOT_X, BTN_Y, SLOT_W + PANEL_W + 3, BH, 3);
        });
        zone.on('pointerout', () => {
            g.clear(); g.fillStyle(COLOR.BTN_GREEN, 1);
            g.fillRoundedRect(SLOT_X, BTN_Y, SLOT_W + PANEL_W + 3, BH, 3);
        });

        this.add.text(W / 2, BTN_Y + 5, '▶  IR A CARRERA', {
            fontSize: '9px', fontFamily: FONT, color: '#4cdf80', fontStyle: 'bold',
        }).setOrigin(0.5, 0);
    }

    private irACarrera() {
        const stats = calcularStatsCarro(this.piezasEquipadas);
        const datos: DatosCarreraScene = {
            carro: { piezas: this.piezasEquipadas, stats },
            circuitoId: this.circuitos[this.circuitoIdx]?.id ?? 'circuito_alfa',
        };
        this.scene.start('CarreraScene', datos);
    }
}
