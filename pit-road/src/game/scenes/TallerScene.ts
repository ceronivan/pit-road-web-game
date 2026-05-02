import { Scene, GameObjects } from 'phaser';
import type { Pieza, CategoriaPieza, DatosCarreraScene } from '../../types';
import piezasData from '../../data/piezas.json';
import { calcularStatsCarro, calcularRendimiento } from '../../systems/SimuladorCarrera';
import { estilos, COLOR } from '../../utils/estilos';

const FONT = "'Open Sans', sans-serif";

const CATEGORIAS: CategoriaPieza[] = [
    'motor', 'suspension', 'llantas', 'transmision', 'aerodinamica', 'electronica',
];

const CAT_LABEL: Record<CategoriaPieza, string> = {
    motor:        'Motor',
    suspension:   'Suspensión',
    llantas:      'Llantas',
    transmision:  'Transmisión',
    aerodinamica: 'Aerodinámica',
    electronica:  'Electrónica',
};

const CAT_CODE: Record<CategoriaPieza, string> = {
    motor: 'MOT', suspension: 'SUS', llantas: 'LLA',
    transmision: 'TRA', aerodinamica: 'AER', electronica: 'ELE',
};

const COLOR_RAREZA: Record<string, number> = {
    comun: COLOR.COMUN,
    rara:  COLOR.RARA,
    epica: COLOR.EPICA,
};

const PIEZAS_INICIALES = ['motor_01', 'suspension_01', 'llantas_01'];

// ── Layout (960×540) ──────────────────────────────────────────────────────────
const HEADER_H  = 44;
const SLOT_X    = 16;
const SLOT_Y0   = 58;    // HEADER_H + 14
const SLOT_W    = 436;
const SLOT_H    = 64;
const SLOT_GAP  = 6;
const DIVIDER_X = 472;
const PANEL_X   = 496;
const BARRA_W   = 400;
const BARRA_H   = 12;
const BTN_Y     = 482;
const BTN_H     = 44;

export class TallerScene extends Scene {
    private piezasEquipadas: Partial<Record<CategoriaPieza, Pieza>> = {};
    private todasPiezas:     Pieza[] = [];
    private panelSelector?:  GameObjects.Container;

    private slotGraphics: GameObjects.Graphics[] = [];
    private slotNombres:  GameObjects.Text[]     = [];
    private slotRareza:   GameObjects.Text[]     = [];

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

    // ── Fondo ─────────────────────────────────────────────────────────────────
    private dibujarFondo() {
        const g = this.add.graphics();
        g.fillStyle(COLOR.BG, 1);
        g.fillRect(0, 0, 960, 540);

        // Divisor vertical
        g.fillStyle(COLOR.CARD_BORDER, 0.4);
        g.fillRect(DIVIDER_X, HEADER_H + 8, 1, BTN_Y - HEADER_H - 16);

        // Franja inferior del botón
        g.fillStyle(COLOR.STRIP_BG, 1);
        g.fillRect(0, BTN_Y - 1, 960, 540 - BTN_Y + 1);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.5);
        g.lineBetween(0, BTN_Y - 1, 960, BTN_Y - 1);
    }

    // ── Header ────────────────────────────────────────────────────────────────
    private dibujarHeader() {
        const g = this.add.graphics();
        g.fillStyle(COLOR.HEADER_BG, 1);
        g.fillRect(0, 0, 960, HEADER_H);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.6);
        g.lineBetween(0, HEADER_H, 960, HEADER_H);

        this.add.text(16, 13, 'TALLER', estilos.titulo);
        this.add.text(PANEL_X, 13, 'ESTADÍSTICAS DEL CARRO', estilos.subtitulo);
    }

    // ── Slots de equipamiento ─────────────────────────────────────────────────
    private dibujarSlots() {
        CATEGORIAS.forEach((cat, i) => {
            const y = SLOT_Y0 + i * (SLOT_H + SLOT_GAP);
            const g = this.add.graphics();
            this.slotGraphics.push(g);

            // Código de categoría (badge fijo)
            this.add.text(SLOT_X + 10, y + 22, CAT_CODE[cat], {
                fontSize: '11px', fontFamily: FONT, color: '#4a7898', fontStyle: 'bold',
            });

            // Nombre de categoría
            this.add.text(SLOT_X + 52, y + 14, CAT_LABEL[cat], estilos.muted);

            // Nombre de pieza (dinámico)
            const nombre = this.add.text(SLOT_X + 52, y + 34, '— vacío —', estilos.dim);
            this.slotNombres.push(nombre);

            // Rareza (dinámico)
            const rar = this.add.text(SLOT_X + SLOT_W - 10, y + 22, '', estilos.dim).setOrigin(1, 0);
            this.slotRareza.push(rar);

            const zone = this.add.zone(SLOT_X, y, SLOT_W, SLOT_H)
                .setOrigin(0, 0).setInteractive({ useHandCursor: true });
            zone.on('pointerdown', () => this.abrirSelector(cat));
            zone.on('pointerover', () => this.resaltarSlot(i, true));
            zone.on('pointerout',  () => this.resaltarSlot(i, false));
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
        g.fillRoundedRect(SLOT_X, y, SLOT_W, SLOT_H, 4);
        g.lineStyle(1, rarColor, pieza ? (hover ? 0.9 : 0.5) : (hover ? 0.3 : 0.12));
        g.strokeRoundedRect(SLOT_X + 0.5, y + 0.5, SLOT_W - 1, SLOT_H - 1, 4);
    }

    private actualizarSlots() {
        CATEGORIAS.forEach((cat, i) => {
            const pieza    = this.piezasEquipadas[cat];
            const rarLabel = pieza?.rareza === 'epica'  ? 'ÉPICA'
                           : pieza?.rareza === 'rara'   ? 'RARA'
                           : pieza                      ? 'COMÚN'
                           : '';
            const rarColor = pieza ? `#${COLOR_RAREZA[pieza.rareza].toString(16).padStart(6, '0')}` : '#334455';

            this.slotNombres[i]
                .setText(pieza ? pieza.nombre : '— vacío —')
                .setColor(pieza ? '#d0e8ff' : '#2a3a4a');
            this.slotRareza[i].setText(rarLabel).setColor(rarColor);
            this.resaltarSlot(i, false);
        });
    }

    // ── Panel de estadísticas ─────────────────────────────────────────────────
    private dibujarPanelStats() {
        const x  = PANEL_X;
        const y0 = HEADER_H + 24;
        const dy = 108;

        this.gfxBars = this.add.graphics();

        const defs: [string, number][] = [
            ['ACELERACIÓN', COLOR.ACCEL],
            ['VELOCIDAD PUNTA', COLOR.SPEED],
            ['MANEJO',    COLOR.HANDL],
        ];

        defs.forEach(([label, _color], idx) => {
            const y = y0 + idx * dy;
            this.add.text(x, y, label, estilos.cardLabel);
            this.gfxBars.fillStyle(COLOR.CARD_BG_ALT, 1);
            this.gfxBars.fillRoundedRect(x, y + 18, BARRA_W, BARRA_H, 3);
        });

        const mx = x + BARRA_W + 12;

        this.barraAccel = this.add.rectangle(x, y0      + 18, 0, BARRA_H, COLOR.ACCEL).setOrigin(0, 0);
        this.lblAccel   = this.add.text(mx, y0      + 17, '0', { fontSize: '13px', fontFamily: FONT, color: '#e05828', fontStyle: 'bold' });

        this.barraSpeed = this.add.rectangle(x, y0 + dy   + 18, 0, BARRA_H, COLOR.SPEED).setOrigin(0, 0);
        this.lblSpeed   = this.add.text(mx, y0 + dy   + 17, '0', { fontSize: '13px', fontFamily: FONT, color: '#8050e0', fontStyle: 'bold' });

        this.barraHandl = this.add.rectangle(x, y0 + dy*2 + 18, 0, BARRA_H, COLOR.HANDL).setOrigin(0, 0);
        this.lblHandl   = this.add.text(mx, y0 + dy*2 + 17, '0', { fontSize: '13px', fontFamily: FONT, color: '#28b878', fontStyle: 'bold' });

        // Rendimiento global
        const ry = y0 + dy * 3 + 4;
        const sg = this.add.graphics();
        sg.lineStyle(1, COLOR.CARD_BORDER, 0.5);
        sg.lineBetween(x, ry, x + BARRA_W + 40, ry);

        this.add.text(x, ry + 12, 'RENDIMIENTO GLOBAL', estilos.cardLabel);
        this.lblRend = this.add.text(x + 200, ry + 7, '—', {
            fontSize: '18px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold',
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
        this.lblRend.setText(`${rend} / 100`).setColor(rendColor);
    }

    // ── Selector de piezas ────────────────────────────────────────────────────
    private abrirSelector(categoria: CategoriaPieza) {
        this.panelSelector?.destroy();

        const piezas   = this.todasPiezas.filter(p => p.categoria === categoria);
        const ITEM_H   = 52;
        const PAD      = 16;
        const POPUP_W  = SLOT_W;     // mismo ancho que slots
        const POPUP_H  = PAD * 2 + 32 + piezas.length * (ITEM_H + 4);

        // Popup sobre la lista de slots, alineado arriba
        const popupY = Math.max(SLOT_Y0, BTN_Y - POPUP_H - 8);
        const c = this.add.container(SLOT_X, popupY);

        const bg = this.add.graphics();
        bg.fillStyle(0x04090f, 0.98);
        bg.fillRoundedRect(0, 0, POPUP_W, POPUP_H, 6);
        bg.lineStyle(2, COLOR.SECTOR_S2, 0.6);
        bg.strokeRoundedRect(1, 1, POPUP_W - 2, POPUP_H - 2, 6);
        c.add(bg);

        c.add(this.add.text(PAD, PAD, CAT_LABEL[categoria].toUpperCase(), estilos.subtitulo));

        const cerrar = this.add.text(POPUP_W - PAD - 12, PAD, '✕', {
            fontSize: '14px', fontFamily: FONT, color: '#5888a8',
        }).setInteractive({ useHandCursor: true }).on('pointerdown', () => c.destroy());
        c.add(cerrar);

        piezas.forEach((p, i) => {
            const y      = PAD + 32 + i * (ITEM_H + 4);
            const rarCol = COLOR_RAREZA[p.rareza];
            const rarHex = `#${rarCol.toString(16).padStart(6, '0')}`;
            const rarStr = p.rareza === 'epica' ? 'ÉPICA' : p.rareza === 'rara' ? 'RARA' : 'COMÚN';

            const itemBg = this.add.graphics();
            const drawItem = (hover: boolean) => {
                itemBg.clear();
                itemBg.fillStyle(hover ? 0x0f2238 : COLOR.CARD_BG, 1);
                itemBg.fillRoundedRect(PAD, y, POPUP_W - PAD * 2, ITEM_H, 3);
                itemBg.lineStyle(1, rarCol, hover ? 0.7 : 0.3);
                itemBg.strokeRoundedRect(PAD + 0.5, y + 0.5, POPUP_W - PAD * 2 - 1, ITEM_H - 1, 3);
            };
            drawItem(false);
            c.add(itemBg);

            c.add(this.add.text(PAD + 12, y + 12, p.nombre, estilos.normal));
            c.add(this.add.text(POPUP_W - PAD - 10, y + 12, rarStr, {
                fontSize: '11px', fontFamily: FONT, color: rarHex, fontStyle: 'bold',
            }).setOrigin(1, 0));

            const zone = this.add.zone(PAD, y, POPUP_W - PAD * 2, ITEM_H)
                .setOrigin(0, 0).setInteractive({ useHandCursor: true });

            zone.on('pointerdown', () => {
                this.piezasEquipadas[categoria] = p;
                this.actualizarSlots();
                this.actualizarStatsUI();
                c.destroy();
            });
            zone.on('pointerover', () => drawItem(true));
            zone.on('pointerout',  () => drawItem(false));
            c.add(zone);
        });

        this.panelSelector = c;
    }

    // ── Botón carrera ─────────────────────────────────────────────────────────
    private dibujarBotonCarrera() {
        const BX = 16, BW = 928, BY = BTN_Y + 8;

        const g = this.add.graphics();
        g.fillStyle(COLOR.BTN_GREEN, 1);
        g.fillRoundedRect(BX, BY, BW, BTN_H, 6);

        const zone = this.add.zone(BX, BY, BW, BTN_H)
            .setOrigin(0, 0).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => this.irACarrera());
        zone.on('pointerover', () => {
            g.clear(); g.fillStyle(COLOR.BTN_GREEN_H, 1); g.fillRoundedRect(BX, BY, BW, BTN_H, 6);
        });
        zone.on('pointerout', () => {
            g.clear(); g.fillStyle(COLOR.BTN_GREEN, 1); g.fillRoundedRect(BX, BY, BW, BTN_H, 6);
        });

        this.add.text(480, BY + BTN_H / 2, 'IR A CARRERA', {
            fontSize: '15px', fontFamily: FONT, color: '#4cdf80', fontStyle: 'bold',
        }).setOrigin(0.5, 0.5);
    }

    private irACarrera() {
        const stats = calcularStatsCarro(this.piezasEquipadas);
        const datos: DatosCarreraScene = { carro: { piezas: this.piezasEquipadas, stats } };
        this.scene.start('CarreraScene', datos);
    }
}
