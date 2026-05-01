import { Scene, GameObjects } from 'phaser';
import type { Pieza, CategoriaPieza, StatsCarro, DatosCarreraScene } from '../../types';
import piezasData from '../../data/piezas.json';
import { calcularStatsCarro, calcularRendimiento } from '../../systems/SimuladorCarrera';
import { estilos } from '../../utils/estilos';

const CATEGORIAS: CategoriaPieza[] = ['motor', 'suspension', 'llantas', 'transmision', 'aerodinamica', 'electronica'];
const CAT_LABEL: Record<CategoriaPieza, string> = {
    motor: 'MOT', suspension: 'SUS', llantas: 'LLA',
    transmision: 'TRA', aerodinamica: 'AER', electronica: 'ELE',
};
const COLOR_RAREZA: Record<string, number> = { comun: 0xaaaaaa, rara: 0x4488ff, epica: 0xffcc00 };
const PIEZAS_INICIALES = ['motor_01', 'suspension_01', 'llantas_01'];

// Layout
const SLOT_X   = 4;
const SLOT_Y0  = 24;
const SLOT_W   = 155;
const SLOT_H   = 20;
const SLOT_GAP = 2;
const PANEL_X  = 166;
const BARRA_W  = 140;
const BARRA_H  = 9;

// Colores de barras de stats
const COLOR_ACCEL   = 0xff6633;  // naranja — acceleration
const COLOR_SPEED   = 0x33aaff;  // azul    — topSpeed
const COLOR_HANDLE  = 0x44cc66;  // verde   — handling
const COLOR_BARRA_BG = 0x1e1e3a;

export class TallerScene extends Scene {
    private piezasEquipadas: Partial<Record<CategoriaPieza, Pieza>> = {};
    private todasPiezas: Pieza[] = [];
    private panelSelector?: GameObjects.Container;
    private slotTextos: GameObjects.Text[] = [];
    private slotFondos: GameObjects.Rectangle[] = [];

    // Barras de stats
    private barraAccel!: GameObjects.Rectangle;
    private barraSpeed!: GameObjects.Rectangle;
    private barraHandle!: GameObjects.Rectangle;
    private labelAccel!: GameObjects.Text;
    private labelSpeed!: GameObjects.Text;
    private labelHandle!: GameObjects.Text;
    private labelRend!: GameObjects.Text;

    constructor() { super('TallerScene'); }

    create() {
        this.todasPiezas = piezasData as Pieza[];
        PIEZAS_INICIALES.forEach(id => {
            const p = this.todasPiezas.find(x => x.id === id);
            if (p) this.piezasEquipadas[p.categoria] = p;
        });

        this.add.text(SLOT_X, 5, 'TALLER', estilos.titulo);
        this.add.text(PANEL_X, 5, 'STATS', estilos.titulo);

        this.dibujarSlots();
        this.dibujarPanelStats();
        this.dibujarBotonCarrera();
        this.actualizarStatsUI();
    }

    // ── Slots de piezas ────────────────────────────────────────────────────────
    private dibujarSlots() {
        CATEGORIAS.forEach((cat, i) => {
            const y = SLOT_Y0 + i * (SLOT_H + SLOT_GAP);

            const fondo = this.add.rectangle(SLOT_X, y, SLOT_W, SLOT_H, 0x1e1e3a)
                .setOrigin(0, 0)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => this.abrirSelector(cat))
                .on('pointerover', () => fondo.setFillStyle(0x2a2a50))
                .on('pointerout',  () => fondo.setFillStyle(0x1e1e3a));
            this.slotFondos.push(fondo);

            this.add.text(SLOT_X + 4, y + 4, CAT_LABEL[cat], estilos.muted);

            const texto = this.add.text(SLOT_X + 34, y + 4, '— vacío —', estilos.dim);
            this.slotTextos.push(texto);
        });
        this.actualizarSlots();
    }

    private actualizarSlots() {
        CATEGORIAS.forEach((cat, i) => {
            const pieza = this.piezasEquipadas[cat];
            const texto = this.slotTextos[i];
            const fondo = this.slotFondos[i];
            if (pieza) {
                texto.setText(pieza.nombre).setColor('#ffffff');
                fondo.setStrokeStyle(1, COLOR_RAREZA[pieza.rareza]);
            } else {
                texto.setText('— vacío —').setColor('#555555');
                fondo.setStrokeStyle(0);
            }
        });
    }

    // ── Panel de stats con barras ──────────────────────────────────────────────
    private dibujarPanelStats() {
        const x  = PANEL_X;
        const y0 = 24;
        const dy = 28;

        // Acceleration
        this.add.text(x, y0, 'ACCEL', estilos.muted);
        this.add.rectangle(x, y0 + 13, BARRA_W, BARRA_H, COLOR_BARRA_BG).setOrigin(0, 0);
        this.barraAccel = this.add.rectangle(x, y0 + 13, 0, BARRA_H, COLOR_ACCEL).setOrigin(0, 0);
        this.labelAccel = this.add.text(x + BARRA_W + 4, y0 + 13, '0', estilos.muted);

        // Top Speed
        this.add.text(x, y0 + dy, 'TOP SPD', estilos.muted);
        this.add.rectangle(x, y0 + dy + 13, BARRA_W, BARRA_H, COLOR_BARRA_BG).setOrigin(0, 0);
        this.barraSpeed = this.add.rectangle(x, y0 + dy + 13, 0, BARRA_H, COLOR_SPEED).setOrigin(0, 0);
        this.labelSpeed = this.add.text(x + BARRA_W + 4, y0 + dy + 13, '0', estilos.muted);

        // Handling
        this.add.text(x, y0 + dy * 2, 'HANDLING', estilos.muted);
        this.add.rectangle(x, y0 + dy * 2 + 13, BARRA_W, BARRA_H, COLOR_BARRA_BG).setOrigin(0, 0);
        this.barraHandle = this.add.rectangle(x, y0 + dy * 2 + 13, 0, BARRA_H, COLOR_HANDLE).setOrigin(0, 0);
        this.labelHandle = this.add.text(x + BARRA_W + 4, y0 + dy * 2 + 13, '0', estilos.muted);

        // Rendimiento total
        this.add.text(x, y0 + dy * 3 + 4, 'REND.', estilos.muted);
        this.labelRend = this.add.text(x + 50, y0 + dy * 3 + 4, '0', estilos.subtitulo);
    }

    private actualizarStatsUI() {
        const stats = calcularStatsCarro(this.piezasEquipadas);
        const rend  = Math.round(calcularRendimiento(stats));

        this.barraAccel.setSize(Math.round((stats.acceleration / 100) * BARRA_W), BARRA_H);
        this.barraSpeed.setSize(Math.round((stats.topSpeed     / 100) * BARRA_W), BARRA_H);
        this.barraHandle.setSize(Math.round((stats.handling    / 100) * BARRA_W), BARRA_H);

        this.labelAccel.setText(`${stats.acceleration}`);
        this.labelSpeed.setText(`${stats.topSpeed}`);
        this.labelHandle.setText(`${stats.handling}`);
        this.labelRend.setText(`${rend}`);

        // Colorear label de rendimiento según valor
        const colorRend = rend >= 70 ? '#44cc66' : rend >= 50 ? '#ffcc00' : '#ff6633';
        this.labelRend.setColor(colorRend);
    }

    // ── Selector de pieza ──────────────────────────────────────────────────────
    private abrirSelector(categoria: CategoriaPieza) {
        this.panelSelector?.destroy();
        const piezasCategoria = this.todasPiezas.filter(p => p.categoria === categoria);
        const ITEM_H  = 22;
        const POPUP_H = 16 + piezasCategoria.length * (ITEM_H + 2) + 6;

        const c = this.add.container(PANEL_X, 120);

        const fondo = this.add.rectangle(0, 0, 150, POPUP_H, 0x0d0d22, 0.97)
            .setOrigin(0, 0).setStrokeStyle(1, 0x4455cc);
        c.add(fondo);
        c.add(this.add.text(4, 3, `ELIGE ${CAT_LABEL[categoria]}`, estilos.subtitulo));

        const cerrar = this.add.text(134, 2, '✕', { ...estilos.normal, color: '#ff4444' })
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => c.destroy());
        c.add(cerrar);

        piezasCategoria.forEach((p, i) => {
            const y = 16 + i * (ITEM_H + 2);
            const itemFondo = this.add.rectangle(2, y, 146, ITEM_H, 0x1e1e3a)
                .setOrigin(0, 0)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    this.piezasEquipadas[categoria] = p;
                    this.actualizarSlots();
                    this.actualizarStatsUI();
                    c.destroy();
                })
                .on('pointerover', () => itemFondo.setFillStyle(0x2a2a50))
                .on('pointerout',  () => itemFondo.setFillStyle(0x1e1e3a));
            c.add(itemFondo);

            const rarLetra = p.rareza === 'comun' ? 'C' : p.rareza === 'rara' ? 'R' : 'E';
            const rarColor = `#${COLOR_RAREZA[p.rareza].toString(16).padStart(6, '0')}`;
            c.add(this.add.text(5,   y + 5, p.nombre,  estilos.normal));
            c.add(this.add.text(134, y + 5, rarLetra, { ...estilos.normal, color: rarColor }));
        });

        this.panelSelector = c;
    }

    // ── Botón ir a carrera ─────────────────────────────────────────────────────
    private dibujarBotonCarrera() {
        const y = 158;
        const boton = this.add.rectangle(SLOT_X, y, SLOT_W, 18, 0x1a4a1a)
            .setOrigin(0, 0)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.irACarrera())
            .on('pointerover', () => boton.setFillStyle(0x236023))
            .on('pointerout',  () => boton.setFillStyle(0x1a4a1a));
        this.add.text(SLOT_X + 25, y + 3, 'IR A CARRERA  ▶', estilos.exito);
    }

    private irACarrera() {
        const stats = calcularStatsCarro(this.piezasEquipadas);
        const datos: DatosCarreraScene = {
            carro: { piezas: this.piezasEquipadas, stats }
        };
        this.scene.start('CarreraScene', datos);
    }
}
