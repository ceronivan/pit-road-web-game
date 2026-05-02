import { Scene, GameObjects, Time } from 'phaser';
import type { Carro, Circuito, EstadoCarrera, Rival, DatosCarreraScene, DatosResultadosScene } from '../../types';
import { generarRivales } from '../../systems/GeneradorRivales';
import { getCircuito, simularVuelta, aplicarPitStop, construirResultado } from '../../systems/SimuladorCarrera';
import { CircuitoRenderer, SECTOR_COLOR, FRAC } from '../../ui/CircuitoRenderer';
import { estilos, COLOR } from '../../utils/estilos';

const VUELTAS_TOTALES  = 20;
const DELAY_BASE_MS    = 8000;   // duración base de una vuelta en ms (a ×1)
const VUELTA_PIT_STOP  = 10;

// Opciones del fader de velocidad
const SPEED_OPTS = [1, 2, 4, 8] as const;
type SpeedMult   = (typeof SPEED_OPTS)[number];

// ── Layout (960×540) ──────────────────────────────────────────────────────────
const HEADER_H  = 44;
const CARDS_Y   = 430;
const CARDS_H   = 55;
const METRICS_Y = 485;   // 485 + 55 = 540 ✓

const CARD_PAD  = 16;
const CARD_GAP  = 8;
const CARD_W    = Math.floor((960 - CARD_PAD * 2 - CARD_GAP * 3) / 4);  // 226

const METRIC_W  = 192;  // 960 / 5

// Fader de velocidad (en header)
const SPD_W  = 42;   // ancho de cada botón
const SPD_H  = 26;
const SPD_G  = 4;    // gap entre botones
const SPD_X0 = 960 - CARD_PAD - SPEED_OPTS.length * (SPD_W + SPD_G) + SPD_G;  // 670
const SPD_Y  = 9;

const FONT = "'Open Sans', sans-serif";

export class CarreraScene extends Scene {
    private carro!:    Carro;
    private circuito!: Circuito;
    private rivales!:  Rival[];
    private estado!:   EstadoCarrera;
    private timer!:    Time.TimerEvent;
    private esperandoPitStop = false;

    private circuitoRenderer!: CircuitoRenderer;
    private progresoVehiculo  = 0;
    private sectorVisual      = 'S1';

    // Velocidad de render
    private speedMult: SpeedMult = 1;
    private speedBtnBgs: GameObjects.Graphics[] = [];

    // Header
    private txtVuelta!:   GameObjects.Text;
    private txtPosicion!: GameObjects.Text;

    // Sector cards
    private sectorCardBg:    GameObjects.Graphics[] = [];
    private sectorCardTxt:   GameObjects.Text[]     = [];
    private sectorCardSpeed: GameObjects.Text[]     = [];
    private sectorCardName:  GameObjects.Text[]     = [];

    // Metrics strip
    private metricBars:  GameObjects.Graphics[] = [];
    private metricTexts: GameObjects.Text[]     = [];

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
        this.rivales  = generarRivales(1, 1);   // solo 1 rival
        this.estado   = this.crearEstadoInicial();
        this.speedMult = 1;

        this.dibujarFondo();
        this.dibujarHeader();
        this.crearCircuito();
        this.crearSectorCards();
        this.crearMetricsStrip();
        this.actualizarUI();
        this.iniciarTimer();
    }

    // ── Update — animación suave, sector sigue posición real del carro ────────
    update(_t: number, delta: number) {
        if (!this.esperandoPitStop) {
            this.progresoVehiculo =
                (this.progresoVehiculo + delta * this.speedMult / DELAY_BASE_MS) % 1;
        }
        this.circuitoRenderer.actualizarVehiculo(this.progresoVehiculo, this.estado.posicion);

        // Sector activo según posición real en pista
        const p    = this.progresoVehiculo;
        const sec  = p < FRAC.s2 ? 'S1'
                   : p < FRAC.s3 ? 'S2'
                   : p < FRAC.s4 ? 'S3'
                   :               'S4';
        if (sec !== this.sectorVisual) {
            this.sectorVisual = sec;
            this.actualizarSectorCards(sec);
            this.circuitoRenderer.dibujarCircuito(sec);
        }
    }

    // ── Fondo ─────────────────────────────────────────────────────────────────
    private dibujarFondo() {
        const g = this.add.graphics();
        g.fillStyle(COLOR.BG, 1);
        g.fillRect(0, 0, 960, 540);

        g.fillStyle(COLOR.STRIP_BG, 0.9);
        g.fillRect(0, CARDS_Y, 960, CARDS_H);

        g.fillStyle(COLOR.STRIP_BG, 1);
        g.fillRect(0, METRICS_Y, 960, 55);

        g.lineStyle(1, COLOR.CARD_BORDER, 0.5);
        g.lineBetween(0, CARDS_Y,   960, CARDS_Y);
        g.lineBetween(0, METRICS_Y, 960, METRICS_Y);
    }

    // ── Header ────────────────────────────────────────────────────────────────
    private dibujarHeader() {
        const g = this.add.graphics();
        g.fillStyle(COLOR.HEADER_BG, 1);
        g.fillRect(0, 0, 960, HEADER_H);
        g.lineStyle(1, COLOR.CARD_BORDER, 0.6);
        g.lineBetween(0, HEADER_H, 960, HEADER_H);

        this.add.text(16, 13, this.circuito.nombre.toUpperCase(), estilos.subtitulo);

        this.txtVuelta = this.add.text(400, 13, '', estilos.normal).setOrigin(0.5, 0);

        // Fader de velocidad en header (derecha)
        this.crearSpeedFader();

        this.txtPosicion = this.add.text(944, 13, '', {
            fontSize: '18px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold',
        }).setOrigin(1, 0);
    }

    // ── Fader de velocidad ────────────────────────────────────────────────────
    private crearSpeedFader() {
        // Etiqueta
        this.add.text(SPD_X0 - 8, SPD_Y + 6, 'VEL', {
            fontSize: '10px', fontFamily: FONT, color: '#4a7898',
        }).setOrigin(1, 0);

        SPEED_OPTS.forEach((speed, i) => {
            const x  = SPD_X0 + i * (SPD_W + SPD_G);
            const bg = this.add.graphics();
            this.speedBtnBgs.push(bg);

            // Texto del botón (encima del fondo)
            this.add.text(x + SPD_W / 2, SPD_Y + 6, `${speed}×`, {
                fontSize: '11px', fontFamily: FONT, color: '#d0e8ff', fontStyle: 'bold',
            }).setOrigin(0.5, 0);

            const zone = this.add.zone(x, SPD_Y, SPD_W, SPD_H)
                .setOrigin(0, 0).setInteractive({ useHandCursor: true });
            zone.on('pointerdown', () => this.setSpeed(speed));
            zone.on('pointerover', () => this.dibujarSpeedBtn(i, true));
            zone.on('pointerout',  () => this.dibujarSpeedBtn(i, false));
        });

        this.refrescarSpeedFader();
    }

    private dibujarSpeedBtn(idx: number, hover: boolean) {
        const x        = SPD_X0 + idx * (SPD_W + SPD_G);
        const isActive = SPEED_OPTS[idx] === this.speedMult;
        const g        = this.speedBtnBgs[idx];

        g.clear();
        if (isActive) {
            g.fillStyle(0x1a3a60, 1);
            g.fillRoundedRect(x, SPD_Y, SPD_W, SPD_H, 3);
            g.lineStyle(1, 0x5070e0, 1);
            g.strokeRoundedRect(x + 0.5, SPD_Y + 0.5, SPD_W - 1, SPD_H - 1, 3);
        } else if (hover) {
            g.fillStyle(0x0f1e30, 1);
            g.fillRoundedRect(x, SPD_Y, SPD_W, SPD_H, 3);
            g.lineStyle(1, COLOR.CARD_BORDER, 0.8);
            g.strokeRoundedRect(x + 0.5, SPD_Y + 0.5, SPD_W - 1, SPD_H - 1, 3);
        } else {
            g.fillStyle(COLOR.CARD_BG, 0.85);
            g.fillRoundedRect(x, SPD_Y, SPD_W, SPD_H, 3);
            g.lineStyle(1, COLOR.CARD_BORDER, 0.4);
            g.strokeRoundedRect(x + 0.5, SPD_Y + 0.5, SPD_W - 1, SPD_H - 1, 3);
        }
    }

    private refrescarSpeedFader() {
        SPEED_OPTS.forEach((_, i) => this.dibujarSpeedBtn(i, false));
    }

    private setSpeed(mult: SpeedMult) {
        this.speedMult = mult;
        this.refrescarSpeedFader();
        // Reinicia timer si la carrera está activa (no en pit stop)
        if (!this.esperandoPitStop) {
            this.iniciarTimer();
        }
    }

    private iniciarTimer() {
        this.timer?.remove();
        this.timer = this.time.addEvent({
            delay:         Math.round(DELAY_BASE_MS / this.speedMult),
            callback:      this.tickVuelta,
            callbackScope: this,
            loop:          true,
        });
    }

    // ── Circuito ──────────────────────────────────────────────────────────────
    private crearCircuito() {
        this.circuitoRenderer = new CircuitoRenderer(this);
        this.circuitoRenderer.dibujarCircuito('S1');

        const segs     = this.circuito.sectores;
        const CX_L     = 168, CX_R = 792, CY = 228, R = 148;
        const cx       = (CX_L + CX_R) / 2;
        const lblStyle = { fontSize: '11px', fontFamily: FONT, color: '#4a7898' };

        this.add.text(cx,         CY + R + 8,  `${segs[0].velocidadPuntaKmh} km/h`, lblStyle).setOrigin(0.5, 0);
        this.add.text(cx,         CY - R - 22, `${segs[2].velocidadPuntaKmh} km/h`, lblStyle).setOrigin(0.5, 0);
        this.add.text(CX_R - 68, CY - 9, `${segs[1].velocidadPuntaKmh} km/h`, lblStyle);
        this.add.text(CX_L + 10, CY - 9, `${segs[3].velocidadPuntaKmh} km/h`, lblStyle);
    }

    // ── Sector cards ──────────────────────────────────────────────────────────
    private crearSectorCards() {
        const nombres = ['Recta principal', 'Curva norte', 'Recta trasera', 'Curva sur'];

        this.circuito.sectores.forEach((seg, i) => {
            const x     = CARD_PAD + i * (CARD_W + CARD_GAP);
            const color = SECTOR_COLOR[seg.id];
            const hexC  = `#${color.toString(16).padStart(6, '0')}`;

            const g = this.add.graphics();
            g.fillStyle(COLOR.CARD_BG, 1);
            g.fillRoundedRect(x, CARDS_Y + 4, CARD_W, CARDS_H - 8, 4);
            g.lineStyle(1, color, 0.25);
            g.strokeRoundedRect(x + 0.5, CARDS_Y + 4.5, CARD_W - 1, CARDS_H - 9, 4);
            this.sectorCardBg.push(g);

            this.sectorCardTxt.push(
                this.add.text(x + 12, CARDS_Y + 11, seg.id, {
                    fontSize: '13px', fontFamily: FONT, color: hexC, fontStyle: 'bold',
                })
            );
            this.sectorCardName.push(
                this.add.text(x + 46, CARDS_Y + 13, nombres[i], estilos.muted)
            );
            this.sectorCardSpeed.push(
                this.add.text(x + 12, CARDS_Y + 33, `${seg.velocidadPuntaKmh} km/h  ·  G${seg.marcha}`, {
                    fontSize: '11px', fontFamily: FONT, color: '#2a3a4a',
                })
            );
        });
    }

    // ── Métricas ──────────────────────────────────────────────────────────────
    private crearMetricsStrip() {
        const labels = ['POSICIÓN', 'VUELTA', 'LLANTAS', 'TEMPERATURA', 'COMBUSTIBLE'];
        const hasBar  = [false, false, true, true, true];

        const sep = this.add.graphics();
        sep.lineStyle(1, COLOR.CARD_BORDER, 0.35);

        labels.forEach((label, i) => {
            const x = i * METRIC_W;
            if (i > 0) sep.lineBetween(x, METRICS_Y + 6, x, METRICS_Y + 48);

            this.add.text(x + 14, METRICS_Y + 7, label, estilos.cardLabel);

            const vTxt = this.add.text(x + 14, METRICS_Y + 22, '—', {
                fontSize: '15px', fontFamily: FONT, color: '#e0f0ff', fontStyle: 'bold',
            });
            this.metricTexts.push(vTxt);

            if (hasBar[i]) {
                const bg = this.add.graphics();
                bg.fillStyle(COLOR.CARD_BG_ALT, 1);
                bg.fillRoundedRect(x + 14, METRICS_Y + 43, METRIC_W - 28, 5, 2);
                this.metricBars.push(bg);
            }
        });
    }

    // ── Estado inicial ────────────────────────────────────────────────────────
    private crearEstadoInicial(): EstadoCarrera {
        return {
            vueltaActual:      0,
            vueltasTotales:    VUELTAS_TOTALES,
            posicion:          2,    // 2 coches en total → arranca en P2
            desgasteLlantas:   0,
            calorMotor:        20,
            combustible:       100,
            durabilidadActual: 100,
            clima:             'despejado',
            enPitStop:         false,
        };
    }

    // ── Actualizar UI ─────────────────────────────────────────────────────────
    private actualizarUI() {
        const e = this.estado;

        this.txtVuelta.setText(`VUELTA  ${e.vueltaActual} / ${e.vueltasTotales}`);

        const posColor = e.posicion === 1 ? '#ffcc00' : '#d0e8ff';
        this.txtPosicion.setText(`P${e.posicion}`).setColor(posColor);

        const tiresColor = e.desgasteLlantas > 70 ? '#ff4455' : e.desgasteLlantas > 40 ? '#ffcc00' : '#4cdf80';
        const heatColor  = e.calorMotor > 80      ? '#ff4455' : e.calorMotor > 60      ? '#ffcc00' : '#4cdf80';
        const combColor  = e.combustible < 20     ? '#ff4455' : e.combustible < 40     ? '#ffcc00' : '#4cdf80';

        this.metricTexts[0].setText(`P${e.posicion}`).setColor(posColor);
        this.metricTexts[1].setText(`${e.vueltaActual} / ${e.vueltasTotales}`).setColor('#d0e8ff');
        this.metricTexts[2].setText(`${Math.round(e.desgasteLlantas)}%`).setColor(tiresColor);
        this.metricTexts[3].setText(`${Math.round(e.calorMotor)}%`).setColor(heatColor);
        this.metricTexts[4].setText(`${Math.round(e.combustible)}%`).setColor(combColor);

        this.actualizarBarra(0, (100 - e.desgasteLlantas) / 100, 0x28b878);
        this.actualizarBarra(1, 1 - Math.min(1, e.calorMotor / 100), 0x8050e0);
        this.actualizarBarra(2, e.combustible / 100, 0xe05828);
    }

    private actualizarBarra(barIdx: number, pct: number, colorBien: number) {
        const x     = (barIdx + 2) * METRIC_W + 14;
        const w     = METRIC_W - 28;
        const fillW = Math.round(Math.max(0, Math.min(1, pct)) * w);
        const g     = this.metricBars[barIdx];

        g.clear();
        g.fillStyle(COLOR.CARD_BG_ALT, 1);
        g.fillRoundedRect(x, METRICS_Y + 43, w, 5, 2);

        const fillColor = pct < 0.3 ? 0xff4455 : pct < 0.6 ? 0xffcc00 : colorBien;
        if (fillW > 0) {
            g.fillStyle(fillColor, 1);
            g.fillRoundedRect(x, METRICS_Y + 43, fillW, 5, 2);
        }
    }

    private actualizarSectorCards(sectorActivoId: string) {
        this.circuito.sectores.forEach((seg, i) => {
            const isActive = seg.id === sectorActivoId;
            const color    = SECTOR_COLOR[seg.id];
            const x        = CARD_PAD + i * (CARD_W + CARD_GAP);
            const hexColor = `#${color.toString(16).padStart(6, '0')}`;
            const g        = this.sectorCardBg[i];

            g.clear();
            if (isActive) {
                g.fillStyle(color, 0.18);
                g.fillRoundedRect(x, CARDS_Y + 4, CARD_W, CARDS_H - 8, 4);
                g.lineStyle(2, color, 0.85);
            } else {
                g.fillStyle(COLOR.CARD_BG, 1);
                g.fillRoundedRect(x, CARDS_Y + 4, CARD_W, CARDS_H - 8, 4);
                g.lineStyle(1, color, 0.2);
            }
            g.strokeRoundedRect(x + 0.5, CARDS_Y + 4.5, CARD_W - 1, CARDS_H - 9, 4);

            this.sectorCardTxt[i].setColor(isActive ? hexColor : '#2a3a4a');
            this.sectorCardSpeed[i].setColor(isActive ? '#6a9ac0' : '#2a3a4a');
            this.sectorCardName[i].setColor(isActive ? '#5888a8' : '#2a3a4a');
        });
    }

    // ── Simulación ────────────────────────────────────────────────────────────
    private tickVuelta() {
        if (this.esperandoPitStop) return;
        this.estado.vueltaActual++;

        if (this.estado.vueltaActual === VUELTA_PIT_STOP) {
            this.timer?.remove();
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
            this.estado.combustible   <= 0 ||
            this.estado.durabilidadActual <= 0) {
            this.terminarCarrera();
        }
    }

    // ── Pit stop ──────────────────────────────────────────────────────────────
    private mostrarPromptPitStop() {
        this.esperandoPitStop = true;

        const PX = 80, PY = 150, PW = 800, PH = 180;
        const c  = this.add.container(0, 0);

        const g = this.add.graphics();
        g.fillStyle(0x04090f, 0.96);
        g.fillRoundedRect(PX, PY, PW, PH, 10);
        g.lineStyle(2, COLOR.SECTOR_S2, 0.75);
        g.strokeRoundedRect(PX + 1, PY + 1, PW - 2, PH - 2, 10);
        c.add(g);

        c.add(this.add.text(PX + 28, PY + 22, 'PIT STOP — Vuelta 10/20', estilos.titulo));
        c.add(this.add.text(PX + 28, PY + 52,
            'Llantas nuevas y combustible completo. Perderás posición temporalmente.',
            estilos.normal));

        const BW = 344, BH = 52, BY = PY + PH - 70, BX2 = PX + 28 + BW + 24;

        // Botón SÍ
        const btnYesBg = this.add.graphics();
        btnYesBg.fillStyle(COLOR.BTN_GREEN, 1);
        btnYesBg.fillRoundedRect(PX + 28, BY, BW, BH, 6);

        const btnYes = this.add.zone(PX + 28, BY, BW, BH)
            .setOrigin(0, 0).setInteractive({ useHandCursor: true });
        btnYes.on('pointerdown', () => {
            this.estado = aplicarPitStop(this.estado);
            this.actualizarUI();
            this.cerrarPitStop(c, btnYesBg, btnNoBg);
        });
        btnYes.on('pointerover', () => { btnYesBg.clear(); btnYesBg.fillStyle(COLOR.BTN_GREEN_H, 1); btnYesBg.fillRoundedRect(PX + 28, BY, BW, BH, 6); });
        btnYes.on('pointerout',  () => { btnYesBg.clear(); btnYesBg.fillStyle(COLOR.BTN_GREEN,   1); btnYesBg.fillRoundedRect(PX + 28, BY, BW, BH, 6); });
        c.add(btnYesBg);
        c.add(this.add.text(PX + 28 + BW / 2, BY + 15, 'ENTRAR AL PIT', {
            fontSize: '15px', fontFamily: FONT, color: '#4cdf80', fontStyle: 'bold',
        }).setOrigin(0.5, 0));
        c.add(btnYes);

        // Botón NO
        const btnNoBg = this.add.graphics();
        btnNoBg.fillStyle(COLOR.BTN_RED, 1);
        btnNoBg.fillRoundedRect(BX2, BY, BW, BH, 6);

        const btnNo = this.add.zone(BX2, BY, BW, BH)
            .setOrigin(0, 0).setInteractive({ useHandCursor: true });
        btnNo.on('pointerdown', () => this.cerrarPitStop(c, btnYesBg, btnNoBg));
        btnNo.on('pointerover', () => { btnNoBg.clear(); btnNoBg.fillStyle(COLOR.BTN_RED_H, 1); btnNoBg.fillRoundedRect(BX2, BY, BW, BH, 6); });
        btnNo.on('pointerout',  () => { btnNoBg.clear(); btnNoBg.fillStyle(COLOR.BTN_RED,   1); btnNoBg.fillRoundedRect(BX2, BY, BW, BH, 6); });
        c.add(btnNoBg);
        c.add(this.add.text(BX2 + BW / 2, BY + 15, 'SEGUIR EN PISTA', {
            fontSize: '15px', fontFamily: FONT, color: '#ff8888', fontStyle: 'bold',
        }).setOrigin(0.5, 0));
        c.add(btnNo);
    }

    private cerrarPitStop(
        container: GameObjects.Container,
        bg1: GameObjects.Graphics,
        bg2: GameObjects.Graphics,
    ) {
        bg1.destroy();
        bg2.destroy();
        container.destroy();
        this.esperandoPitStop = false;
        // Reinicia timer con la velocidad actual (puede haber cambiado durante el pit stop)
        this.iniciarTimer();
    }

    // ── Fin de carrera ────────────────────────────────────────────────────────
    private terminarCarrera() {
        this.timer?.remove();
        const resultado = construirResultado(this.estado);
        const datos: DatosResultadosScene = { resultado, estadoCarrera: this.estado };
        this.time.delayedCall(1200, () => this.scene.start('ResultadosScene', datos));
    }
}
