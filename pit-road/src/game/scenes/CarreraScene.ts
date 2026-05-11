import { Scene, GameObjects, Time } from 'phaser';
import type { Carro, CircuitoComputado, EstadoCarrera, Rival, DatosCarreraScene, DatosResultadosScene } from '../../types';
import { generarRivales } from '../../systems/GeneradorRivales';
import { getCircuito } from '../../systems/CircuitoBuilder';
import { simularVuelta, aplicarPitStop, construirResultado } from '../../systems/SimuladorCarrera';
import { CircuitoRenderer, colorDeSector } from '../../ui/CircuitoRenderer';
import { estilos, COLOR } from '../../utils/estilos';

// ── Game config (independent of circuit) ─────────────────────────────────────
const VUELTAS_TOTALES  = 20;
const DELAY_VUELTA_MS  = 2500;
const VUELTA_PIT_STOP  = 10;

// ── Layout (480×270 canvas) ───────────────────────────────────────────────────
const W          = 480;
const HEADER_H   = 18;
const CIRCUIT_H  = 194;
const STRIP_Y    = HEADER_H + CIRCUIT_H;  // 212 — sector strip top
const STRIP_H    = 9;
const DETAIL_Y   = STRIP_Y + STRIP_H;     // 221 — active sector info
const DETAIL_H   = 18;
const METRICS_Y  = DETAIL_Y + DETAIL_H;   // 239 — metrics strip

const FONT = "'Open Sans', sans-serif";

export class CarreraScene extends Scene {
    private carro!:     Carro;
    private circuito!:  CircuitoComputado;
    private rivales!:   Rival[];
    private estado!:    EstadoCarrera;
    private timer!:     Time.TimerEvent;
    private esperandoPitStop = false;

    private circuitoRenderer!: CircuitoRenderer;
    private progresoVehiculo  = 0;

    // Header
    private txtVuelta!:   GameObjects.Text;
    private txtPosicion!: GameObjects.Text;

    // Sector strip (proportional colored bars)
    private stripGraphics!: GameObjects.Graphics;

    // Active sector detail bar
    private detailBg!:    GameObjects.Graphics;
    private detailTxt!:   GameObjects.Text;
    private detailSpeed!: GameObjects.Text;

    // Metrics strip
    private metricTexts: GameObjects.Text[] = [];

    constructor() { super('CarreraScene'); }

    init(datos: DatosCarreraScene) {
        this.carro = datos.carro ?? {
            piezas: {},
            stats: { acceleration: 50, topSpeed: 50, handling: 50 },
        };
    }

    create() {
        const circuitoId = (this.scene.settings.data as DatosCarreraScene)?.circuitoId ?? 'circuito_alfa';
        this.circuito = getCircuito(circuitoId);
        this.rivales  = generarRivales(5, 1);
        this.estado   = this.crearEstadoInicial();

        this.dibujarFondo();
        this.dibujarHeader();
        this.crearCircuito();
        this.crearSectorStrip();
        this.crearDetailBar();
        this.crearMetricsStrip();
        this.actualizarUI();

        this.timer = this.time.addEvent({
            delay: DELAY_VUELTA_MS, callback: this.tickVuelta,
            callbackScope: this, loop: true,
        });
    }

    update(_t: number, delta: number) {
        if (!this.esperandoPitStop) {
            this.progresoVehiculo = (this.progresoVehiculo + delta / DELAY_VUELTA_MS) % 1;
        }
        this.circuitoRenderer.actualizarVehiculo(this.progresoVehiculo, this.estado.posicion);
    }

    // ── Background ────────────────────────────────────────────────────────────
    private dibujarFondo() {
        const g = this.add.graphics();
        g.fillStyle(COLOR.BG, 1);
        g.fillRect(0, 0, W, 270);
        g.fillStyle(COLOR.STRIP_BG, 1);
        g.fillRect(0, METRICS_Y, W, 270 - METRICS_Y);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.6);
        g.lineBetween(0, METRICS_Y, W, METRICS_Y);
    }

    // ── Header bar ────────────────────────────────────────────────────────────
    private dibujarHeader() {
        const g = this.add.graphics();
        g.fillStyle(COLOR.HEADER_BG, 1);
        g.fillRect(0, 0, W, HEADER_H);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.5);
        g.lineBetween(0, HEADER_H, W, HEADER_H);

        this.add.text(5, 3, this.circuito.nombre.toUpperCase(), {
            fontSize: '9px', fontFamily: FONT, color: '#7ab8e8',
        });
        this.txtVuelta   = this.add.text(200, 3, '', { fontSize: '9px', fontFamily: FONT, color: '#d0e8ff' });
        this.txtPosicion = this.add.text(390, 3, '', { fontSize: '9px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold' });
    }

    // ── Circuit renderer ──────────────────────────────────────────────────────
    private crearCircuito() {
        this.circuitoRenderer = new CircuitoRenderer(this, this.circuito);
        this.circuitoRenderer.dibujarCircuito(0);
    }

    // ── Sector strip — proportional colored bars ──────────────────────────────
    private crearSectorStrip() {
        this.stripGraphics = this.add.graphics();

        const sepG = this.add.graphics();
        sepG.lineStyle(1, COLOR.CARD_BORDER, 0.3);
        sepG.lineBetween(0, STRIP_Y, W, STRIP_Y);
        sepG.lineBetween(0, DETAIL_Y, W, DETAIL_Y);
    }

    private dibujarSectorStrip(sectorActivoIdx: number) {
        this.stripGraphics.clear();
        const total = this.circuito.sectores.reduce((a, s) => a + s.longitudMetros, 0) || 1;
        let x = 0;
        this.circuito.sectores.forEach((seg, idx) => {
            const w      = Math.round((seg.longitudMetros / total) * W);
            const isAct  = idx === sectorActivoIdx;
            const color  = colorDeSector(idx);
            this.stripGraphics.fillStyle(color, isAct ? 0.85 : 0.20);
            this.stripGraphics.fillRect(x, STRIP_Y, w, STRIP_H);
            x += w;
        });
    }

    // ── Active sector detail bar ──────────────────────────────────────────────
    private crearDetailBar() {
        this.detailBg    = this.add.graphics();
        this.detailTxt   = this.add.text(6, DETAIL_Y + 3, '', {
            fontSize: '8px', fontFamily: FONT, color: '#7ab8e8', fontStyle: 'bold',
        });
        this.detailSpeed = this.add.text(W - 6, DETAIL_Y + 3, '', {
            fontSize: '8px', fontFamily: FONT, color: '#5888a8',
        }).setOrigin(1, 0);
    }

    private actualizarDetailBar(sectorIdx: number) {
        this.detailBg.clear();
        const seg   = this.circuito.sectores[sectorIdx];
        const color = colorDeSector(sectorIdx);
        this.detailBg.fillStyle(color, 0.08);
        this.detailBg.fillRect(0, DETAIL_Y, W, DETAIL_H);
        this.detailTxt.setText(`${seg.id}  ${seg.nombre}`).setColor(`#${color.toString(16).padStart(6, '0')}`);
        this.detailSpeed.setText(`${seg.velocidadPuntaKmh} km/h  G${seg.marcha}`);
    }

    // ── Metrics strip ─────────────────────────────────────────────────────────
    private crearMetricsStrip() {
        const labels = ['POS', 'VUELTA', 'LLANTAS', 'CALOR', 'COMB'];
        const METRIC_W = W / labels.length;  // 96px each
        const sepG     = this.add.graphics();
        sepG.lineStyle(1, COLOR.CARD_BORDER, 0.5);

        labels.forEach((label, i) => {
            const x = Math.round(i * METRIC_W);
            if (i > 0) sepG.lineBetween(x, METRICS_Y + 3, x, METRICS_Y + 28);
            this.add.text(x + 4, METRICS_Y + 2, label, estilos.cardLabel);
            const vTxt = this.add.text(x + 4, METRICS_Y + 12, '—', {
                fontSize: '11px', fontFamily: FONT, color: '#e0f0ff', fontStyle: 'bold',
            });
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
        const n  = this.circuito.sectores.length;

        this.txtVuelta.setText(`V. ${v} / ${vt}`);
        const posColor = e.posicion === 1 ? '#ffcc00' : e.posicion <= 3 ? '#4cdf80' : '#d0e8ff';
        this.txtPosicion.setText(`P ${e.posicion}`).setColor(posColor);

        const tiresColor = e.desgasteLlantas > 70 ? '#ff4455' : e.desgasteLlantas > 40 ? '#ffcc00' : '#4cdf80';
        const heatColor  = e.calorMotor > 80 ? '#ff4455' : e.calorMotor > 60 ? '#ffcc00' : '#4cdf80';
        const combColor  = e.combustible < 20 ? '#ff4455' : e.combustible < 40 ? '#ffcc00' : '#4cdf80';

        this.metricTexts[0].setText(e.posicion === 1 ? '1° ★' : `${e.posicion}°`).setColor(posColor);
        this.metricTexts[1].setText(`${v}/${vt}`).setColor('#d0e8ff');
        this.metricTexts[2].setText(`${Math.round(e.desgasteLlantas)}%`).setColor(tiresColor);
        this.metricTexts[3].setText(`${Math.round(e.calorMotor)}%`).setColor(heatColor);
        this.metricTexts[4].setText(`${Math.round(e.combustible)}%`).setColor(combColor);

        const sectorIdx = v % n;
        this.dibujarSectorStrip(sectorIdx);
        this.actualizarDetailBar(sectorIdx);
        this.circuitoRenderer.dibujarCircuito(sectorIdx);
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
            this.estado.combustible  <= 0 ||
            this.estado.durabilidadActual <= 0) {
            this.terminarCarrera();
        }
    }

    // ── Pit stop modal ────────────────────────────────────────────────────────
    private mostrarPromptPitStop() {
        this.esperandoPitStop = true;
        const PX = 12, PY = 72, PW = W - 24, PH = 75;
        const c  = this.add.container(0, 0);

        const g = this.add.graphics();
        g.fillStyle(0x060e1a, 0.97);
        g.fillRoundedRect(PX, PY, PW, PH, 4);
        g.lineStyle(1, COLOR.SECTOR_S2, 0.8);
        g.strokeRoundedRect(PX + 0.5, PY + 0.5, PW - 1, PH - 1, 4);
        c.add(g);

        c.add(this.add.text(PX + 12, PY + 10, '¿PIT STOP?', {
            fontSize: '11px', fontFamily: FONT, color: '#7ab8e8', fontStyle: 'bold',
        }));
        c.add(this.add.text(PX + 12, PY + 28, 'Llantas frescas · pierdes ~3 posiciones', {
            fontSize: '9px', fontFamily: FONT, color: '#4a7898',
        }));

        const BW = 190, BH = 20, BY = PY + 46;

        const btnYesBg = this.add.graphics();
        btnYesBg.fillStyle(COLOR.BTN_GREEN, 1);
        btnYesBg.fillRoundedRect(PX + 12, BY, BW, BH, 3);
        const btnYes = this.add.zone(PX + 12, BY, BW, BH).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        btnYes.on('pointerdown', () => { this.estado = aplicarPitStop(this.estado); this.actualizarUI(); this.cerrarPitStop(c, btnYesBg, btnNoBg); });
        btnYes.on('pointerover',  () => { btnYesBg.clear(); btnYesBg.fillStyle(COLOR.BTN_GREEN_H, 1); btnYesBg.fillRoundedRect(PX + 12, BY, BW, BH, 3); });
        btnYes.on('pointerout',   () => { btnYesBg.clear(); btnYesBg.fillStyle(COLOR.BTN_GREEN, 1);   btnYesBg.fillRoundedRect(PX + 12, BY, BW, BH, 3); });
        c.add(btnYesBg);
        c.add(this.add.text(PX + 40, BY + 4, 'SÍ, ENTRAR AL PIT', estilos.exito));
        c.add(btnYes);

        const btnNoBg = this.add.graphics();
        btnNoBg.fillStyle(COLOR.BTN_RED, 1);
        btnNoBg.fillRoundedRect(PX + 12 + BW + 10, BY, BW, BH, 3);
        const btnNo = this.add.zone(PX + 12 + BW + 10, BY, BW, BH).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        btnNo.on('pointerdown', () => this.cerrarPitStop(c, btnYesBg, btnNoBg));
        btnNo.on('pointerover',  () => { btnNoBg.clear(); btnNoBg.fillStyle(COLOR.BTN_RED_H, 1); btnNoBg.fillRoundedRect(PX + 12 + BW + 10, BY, BW, BH, 3); });
        btnNo.on('pointerout',   () => { btnNoBg.clear(); btnNoBg.fillStyle(COLOR.BTN_RED, 1);   btnNoBg.fillRoundedRect(PX + 12 + BW + 10, BY, BW, BH, 3); });
        c.add(btnNoBg);
        c.add(this.add.text(PX + 40 + BW + 10, BY + 4, 'NO, SEGUIR', {
            fontSize: '9px', fontFamily: FONT, color: '#ff8888',
        }));
        c.add(btnNo);
    }

    private cerrarPitStop(
        container: GameObjects.Container,
        bg1: GameObjects.Graphics,
        bg2: GameObjects.Graphics,
    ) {
        bg1.destroy(); bg2.destroy(); container.destroy();
        this.esperandoPitStop = false;
        this.timer.paused     = false;
    }

    // ── End of race ───────────────────────────────────────────────────────────
    private terminarCarrera() {
        this.timer.remove();
        const resultado = construirResultado(this.estado);
        const datos: DatosResultadosScene = {
            resultado,
            estadoCarrera: this.estado,
            nombreCircuito: this.circuito.nombre,
        };
        this.time.delayedCall(1200, () => this.scene.start('ResultadosScene', datos));
    }
}
