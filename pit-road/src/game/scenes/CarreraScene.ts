import { Scene, GameObjects, Time } from 'phaser';
import type { Carro, Circuito, EstadoCarrera, Rival, DatosCarreraScene, DatosResultadosScene } from '../../types';
import { generarRivales } from '../../systems/GeneradorRivales';
import { getCircuito, simularVuelta, aplicarPitStop, construirResultado } from '../../systems/SimuladorCarrera';
import { CircuitoRenderer, SECTOR_COLOR, CX_L, CX_R, CY, R } from '../../ui/CircuitoRenderer';
import { estilos, COLOR } from '../../utils/estilos';

const VUELTAS_TOTALES = 20;
const DELAY_VUELTA_MS = 1500;
const VUELTA_PIT_STOP = 10;

// ── Layout zones ──────────────────────────────────────────────────────────────
const HEADER_H   = 13;   // y = 0 – 13
const CIRCUIT_H  = 132;  // y = 13 – HEADER_H + CIRCUIT_H (circuit area bottom)
const CARDS_Y    = HEADER_H + CIRCUIT_H;   // = 145
const CARDS_H    = 21;
const METRICS_Y  = CARDS_Y + CARDS_H;     // = 166
// Metrics strip: y = 166 – 180

const FONT = "'Open Sans', sans-serif";

export class CarreraScene extends Scene {
    private carro!:    Carro;
    private circuito!: Circuito;
    private rivales!:  Rival[];
    private estado!:   EstadoCarrera;
    private timer!:    Time.TimerEvent;
    private esperandoPitStop = false;

    // Circuit renderer
    private circuitoRenderer!: CircuitoRenderer;
    private progresoVehiculo  = 0;

    // Speed labels (static text positioned on circuit)
    private labelVelBottom!: GameObjects.Text;
    private labelVelTop!:    GameObjects.Text;

    // Header
    private txtVuelta!:   GameObjects.Text;
    private txtPosicion!: GameObjects.Text;

    // Sector cards (4 background rects + label texts)
    private sectorCardBg:     GameObjects.Graphics[] = [];
    private sectorCardTxt:    GameObjects.Text[]     = [];
    private sectorCardSpeed:  GameObjects.Text[]     = [];

    // Metrics strip
    private metricTexts: GameObjects.Text[] = [];

    constructor() { super('CarreraScene'); }

    // ── Init ──────────────────────────────────────────────────────────────────
    init(datos: DatosCarreraScene) {
        this.carro = datos.carro ?? {
            piezas: {},
            stats: { acceleration: 50, topSpeed: 50, handling: 50 },
        };
    }

    // ── Create ────────────────────────────────────────────────────────────────
    create() {
        this.circuito = getCircuito('circuito_alfa');
        this.rivales  = generarRivales(5, 1);
        this.estado   = this.crearEstadoInicial();

        this.dibujarFondo();
        this.dibujarHeader();
        this.crearCircuito();
        this.crearSectorCards();
        this.crearMetricsStrip();
        this.actualizarUI();

        this.timer = this.time.addEvent({
            delay:         DELAY_VUELTA_MS,
            callback:      this.tickVuelta,
            callbackScope: this,
            loop:          true,
        });
    }

    // ── Update (smooth vehicle animation) ────────────────────────────────────
    update(_t: number, delta: number) {
        if (!this.esperandoPitStop) {
            this.progresoVehiculo = (this.progresoVehiculo + delta / DELAY_VUELTA_MS) % 1;
        }
        this.circuitoRenderer.actualizarVehiculo(this.progresoVehiculo, this.estado.posicion);
    }

    // ── Background ────────────────────────────────────────────────────────────
    private dibujarFondo() {
        const g = this.add.graphics();
        // Overall background
        g.fillStyle(COLOR.BG, 1);
        g.fillRect(0, 0, 320, 180);
        // Metric strip bg
        g.fillStyle(COLOR.STRIP_BG, 1);
        g.fillRect(0, METRICS_Y, 320, 180 - METRICS_Y);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.6);
        g.lineBetween(0, METRICS_Y, 320, METRICS_Y);
    }

    // ── Header bar ────────────────────────────────────────────────────────────
    private dibujarHeader() {
        const g = this.add.graphics();
        g.fillStyle(COLOR.HEADER_BG, 1);
        g.fillRect(0, 0, 320, HEADER_H);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.5);
        g.lineBetween(0, HEADER_H, 320, HEADER_H);

        this.add.text(4, 2, this.circuito.nombre.toUpperCase(), {
            fontSize: '12px', fontFamily: FONT, color: '#7ab8e8',
        });

        this.txtVuelta   = this.add.text(130, 2, '', { fontSize: '12px', fontFamily: FONT, color: '#d0e8ff' });
        this.txtPosicion = this.add.text(254, 2, '', { fontSize: '12px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold' });
    }

    // ── Circuit area ──────────────────────────────────────────────────────────
    private crearCircuito() {
        this.circuitoRenderer = new CircuitoRenderer(this);
        this.circuitoRenderer.dibujarCircuito('S1');

        // Speed labels above/below straights and inside curves
        const cx   = (CX_L + CX_R) / 2;
        const segs = this.circuito.sectores;  // [S1, S2, S3, S4]
        const lblStyle = { fontSize: '7px', fontFamily: FONT, color: '#5888a8' };

        this.labelVelTop    = this.add.text(cx, CY - R - 9, `${segs[2].velocidadPuntaKmh}km/h  G${segs[2].marcha}`, { ...lblStyle }).setOrigin(0.5, 0);
        this.labelVelBottom = this.add.text(cx, CY + R + 2, `${segs[0].velocidadPuntaKmh}km/h  G${segs[0].marcha}`, { ...lblStyle }).setOrigin(0.5, 0);
        // Curve labels placed inside oval interior (no room outside in 320px canvas)
        this.add.text(CX_R - 30, CY - 4, `${segs[1].velocidadPuntaKmh}km/h`, { ...lblStyle });
        this.add.text(CX_L +  6, CY - 4, `${segs[3].velocidadPuntaKmh}km/h`, { ...lblStyle });
    }

    // ── Sector cards ──────────────────────────────────────────────────────────
    private crearSectorCards() {
        const CARD_W = 79, GAP = 1;
        const abbrev = ['Recta ppci.', 'Curva N.', 'Recta tras.', 'Curva S.'];

        this.circuito.sectores.forEach((seg, i) => {
            const x = i * (CARD_W + GAP);
            const color = SECTOR_COLOR[seg.id];

            const g = this.add.graphics();
            g.fillStyle(COLOR.CARD_BG, 1);
            g.fillRect(x, CARDS_Y, CARD_W, CARDS_H);
            g.lineStyle(1, color, 0.25);
            g.strokeRect(x + 0.5, CARDS_Y + 0.5, CARD_W - 1, CARDS_H - 1);
            this.sectorCardBg.push(g);

            // Sector ID tag
            const idTxt = this.add.text(x + 4, CARDS_Y + 4, seg.id, {
                fontSize: '12px', fontFamily: FONT,
                color: `#${color.toString(16).padStart(6, '0')}`,
                fontStyle: 'bold',
            });
            this.sectorCardTxt.push(idTxt);

            // Sector short name
            this.add.text(x + 22, CARDS_Y + 4, abbrev[i], {
                fontSize: '12px', fontFamily: FONT, color: '#5888a8',
            });

            // Speed
            const spdTxt = this.add.text(x + 4, CARDS_Y + 13, `${seg.velocidadPuntaKmh}km/h`, {
                fontSize: '7px', fontFamily: FONT, color: '#3a6080',
            });
            this.sectorCardSpeed.push(spdTxt);
        });

        // Top separator
        const g2 = this.add.graphics();
        g2.lineStyle(1, COLOR.CARD_BORDER, 0.4);
        g2.lineBetween(0, CARDS_Y, 320, CARDS_Y);
        g2.lineBetween(0, METRICS_Y - 1, 320, METRICS_Y - 1);
    }

    // ── Metrics strip ─────────────────────────────────────────────────────────
    private crearMetricsStrip() {
        const labels = ['POS', 'VUELTA', 'LLANTAS', 'CALOR', 'COMB'];
        const W = 64, Y = METRICS_Y;

        labels.forEach((label, i) => {
            const x = i * W;
            // Separator line between blocks
            if (i > 0) {
                const g = this.add.graphics();
                g.lineStyle(1, COLOR.CARD_BORDER, 0.5);
                g.lineBetween(x, Y + 2, x, Y + 14 - 2);
            }
            this.add.text(x + 3, Y + 2, label, estilos.cardLabel);
            const vTxt = this.add.text(x + 3, Y + 10, '—', estilos.cardValue);
            this.metricTexts.push(vTxt);
        });
    }

    // ── Estado inicial ────────────────────────────────────────────────────────
    private crearEstadoInicial(): EstadoCarrera {
        return {
            vueltaActual: 0, vueltasTotales: VUELTAS_TOTALES,
            posicion: 3,     desgasteLlantas: 0,
            calorMotor: 20,  combustible: 100,
            durabilidadActual: 100, clima: 'despejado', enPitStop: false,
        };
    }

    // ── UI Update ─────────────────────────────────────────────────────────────
    private actualizarUI() {
        const e  = this.estado;
        const v  = e.vueltaActual;
        const vt = e.vueltasTotales;

        this.txtVuelta.setText(`V. ${v} / ${vt}`);

        const posColor = e.posicion === 1 ? '#ffcc00' : e.posicion <= 3 ? '#4cdf80' : '#d0e8ff';
        this.txtPosicion.setText(`P ${e.posicion}`).setColor(posColor);

        // Metrics
        const tiresColor = e.desgasteLlantas > 70 ? '#ff4455' : e.desgasteLlantas > 40 ? '#ffcc00' : '#4cdf80';
        const heatColor  = e.calorMotor > 80 ? '#ff4455' : e.calorMotor > 60 ? '#ffcc00' : '#4cdf80';
        const combColor  = e.combustible < 20 ? '#ff4455' : e.combustible < 40 ? '#ffcc00' : '#4cdf80';

        const posStr   = e.posicion === 1 ? '1° ★' : `${e.posicion}°`;
        this.metricTexts[0].setText(posStr).setColor(posColor);
        this.metricTexts[1].setText(`${v}/${vt}`).setColor('#d0e8ff');
        this.metricTexts[2].setText(`${Math.round(e.desgasteLlantas)}%`).setColor(tiresColor);
        this.metricTexts[3].setText(`${Math.round(e.calorMotor)}%`).setColor(heatColor);
        this.metricTexts[4].setText(`${Math.round(e.combustible)}%`).setColor(combColor);

        // Active sector
        const sectorIdx    = v % 4;
        const sectorActivo = this.circuito.sectores[sectorIdx];
        this.actualizarSectorCards(sectorActivo.id);
        this.circuitoRenderer.dibujarCircuito(sectorActivo.id);
    }

    private actualizarSectorCards(sectorActivoId: string) {
        this.circuito.sectores.forEach((seg, i) => {
            const isActive = seg.id === sectorActivoId;
            const color    = SECTOR_COLOR[seg.id];
            const g        = this.sectorCardBg[i];
            const CARD_W   = 79;
            const x        = i * (CARD_W + 1);

            g.clear();
            // Active card: filled background with dim sector color
            if (isActive) {
                g.fillStyle(color, 0.15);
                g.fillRect(x, CARDS_Y, CARD_W, CARDS_H);
                g.lineStyle(1, color, 0.7);
            } else {
                g.fillStyle(COLOR.CARD_BG, 1);
                g.fillRect(x, CARDS_Y, CARD_W, CARDS_H);
                g.lineStyle(1, color, 0.2);
            }
            g.strokeRect(x + 0.5, CARDS_Y + 0.5, CARD_W - 1, CARDS_H - 1);

            // Update text color
            const hexColor = `#${color.toString(16).padStart(6, '0')}`;
            this.sectorCardTxt[i].setColor(isActive ? hexColor : '#334455');
            this.sectorCardSpeed[i].setColor(isActive ? '#6a9ac0' : '#2a3a4a');
        });
    }

    // ── Simulation tick ───────────────────────────────────────────────────────
    private tickVuelta() {
        if (this.esperandoPitStop) return;
        this.estado.vueltaActual++;

        if (this.estado.vueltaActual === VUELTA_PIT_STOP) {
            this.timer.paused = true;
            this.mostrarPromptPitStop();
            return;
        }

        const res = simularVuelta(this.estado, this.carro.stats, this.rivales, this.circuito);
        this.estado = {
            ...this.estado,
            posicion:          res.posicion,
            desgasteLlantas:   res.desgasteLlantas,
            calorMotor:        res.calorMotor,
            combustible:       res.combustible,
            durabilidadActual: res.durabilidadActual,
        };

        this.actualizarUI();

        if (this.estado.vueltaActual >= VUELTAS_TOTALES ||
            this.estado.combustible <= 0 ||
            this.estado.durabilidadActual <= 0) {
            this.terminarCarrera();
        }
    }

    // ── Pit stop modal ────────────────────────────────────────────────────────
    private mostrarPromptPitStop() {
        this.esperandoPitStop = true;
        const PX = 8, PY = 48, PW = 304, PH = 50;
        const c  = this.add.container(0, 0);

        // Card background
        const g = this.add.graphics();
        g.fillStyle(0x060e1a, 0.97);
        g.fillRoundedRect(PX, PY, PW, PH, 4);
        g.lineStyle(1, COLOR.SECTOR_S2, 0.8);
        g.strokeRoundedRect(PX + 0.5, PY + 0.5, PW - 1, PH - 1, 4);
        c.add(g);

        c.add(this.add.text(PX + 8, PY + 7, '¿PIT STOP?', {
            fontSize: '14px', fontFamily: FONT, color: '#7ab8e8', fontStyle: 'bold',
        }));
        c.add(this.add.text(PX + 8, PY + 23, 'Llantas frescas · pierdes ~3 posiciones', {
            fontSize: '12px', fontFamily: FONT, color: '#4a7898',
        }));

        // YES button
        const BW = 130, BH = 16, BY = PY + 31;
        const btnYesBg = this.add.graphics();
        btnYesBg.fillStyle(COLOR.BTN_GREEN, 1);
        btnYesBg.fillRoundedRect(PX + 8, BY, BW, BH, 3);
        const btnYes = this.add.zone(PX + 8, BY, BW, BH).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        btnYes.on('pointerdown', () => {
            this.estado = aplicarPitStop(this.estado);
            this.actualizarUI();
            this.cerrarPitStop(c, btnYesBg, btnNoBg);
        });
        btnYes.on('pointerover',  () => { btnYesBg.clear(); btnYesBg.fillStyle(COLOR.BTN_GREEN_H, 1); btnYesBg.fillRoundedRect(PX + 8, BY, BW, BH, 3); });
        btnYes.on('pointerout',   () => { btnYesBg.clear(); btnYesBg.fillStyle(COLOR.BTN_GREEN, 1);   btnYesBg.fillRoundedRect(PX + 8, BY, BW, BH, 3); });
        c.add(btnYesBg);
        c.add(this.add.text(PX + 28, BY + 3, 'SÍ, ENTRAR AL PIT', estilos.exito));
        c.add(btnYes);

        // NO button
        const btnNoBg = this.add.graphics();
        btnNoBg.fillStyle(COLOR.BTN_RED, 1);
        btnNoBg.fillRoundedRect(PX + 8 + BW + 8, BY, BW, BH, 3);
        const btnNo = this.add.zone(PX + 8 + BW + 8, BY, BW, BH).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        btnNo.on('pointerdown', () => this.cerrarPitStop(c, btnYesBg, btnNoBg));
        btnNo.on('pointerover',  () => { btnNoBg.clear(); btnNoBg.fillStyle(COLOR.BTN_RED_H, 1); btnNoBg.fillRoundedRect(PX + 8 + BW + 8, BY, BW, BH, 3); });
        btnNo.on('pointerout',   () => { btnNoBg.clear(); btnNoBg.fillStyle(COLOR.BTN_RED, 1);   btnNoBg.fillRoundedRect(PX + 8 + BW + 8, BY, BW, BH, 3); });
        c.add(btnNoBg);
        c.add(this.add.text(PX + 28 + BW + 8, BY + 3, 'NO, SEGUIR', {
            fontSize: '12px', fontFamily: FONT, color: '#ff8888',
        }));
        c.add(btnNo);
    }

    private cerrarPitStop(
        container: GameObjects.Container,
        bg1: GameObjects.Graphics,
        bg2: GameObjects.Graphics
    ) {
        bg1.destroy();
        bg2.destroy();
        container.destroy();
        this.esperandoPitStop = false;
        this.timer.paused     = false;
    }

    // ── End of race ───────────────────────────────────────────────────────────
    private terminarCarrera() {
        this.timer.remove();
        const resultado = construirResultado(this.estado);
        const datos: DatosResultadosScene = { resultado, estadoCarrera: this.estado };
        this.time.delayedCall(1200, () => this.scene.start('ResultadosScene', datos));
    }
}
