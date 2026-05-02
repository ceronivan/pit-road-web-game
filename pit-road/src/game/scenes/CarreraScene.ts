import { Scene, GameObjects } from 'phaser';
import type { Carro, Circuito, EstadoCarrera, Rival, DatosCarreraScene, DatosResultadosScene } from '../../types';
import { generarRivales } from '../../systems/GeneradorRivales';
import { getCircuito, simularVuelta, construirResultado } from '../../systems/SimuladorCarrera';
import { CircuitoRenderer, SECTOR_COLOR, FRAC, CX_L, CX_R, CY, R } from '../../ui/CircuitoRenderer';
import { estilos, COLOR } from '../../utils/estilos';

const VUELTAS_TOTALES = 20;

// Tiempo base para una vuelta a ×1 (ms).
// Con velocidad variable real el tiempo exacto varía, pero este valor
// define la "escala de referencia" para la animación.
const DELAY_BASE_MS = 8000;

// Opciones del fader de velocidad
const SPEED_OPTS = [1, 2, 4, 8] as const;
type SpeedMult   = (typeof SPEED_OPTS)[number];

// Standing-start: rampa de aceleración en los primeros N ms reales
const STARTUP_MS = 3200;

// ── Layout (960×540) ──────────────────────────────────────────────────────────
const HEADER_H  = 44;
const CARDS_Y   = 430;
const CARDS_H   = 55;
const METRICS_Y = 485;

const CARD_PAD  = 16;
const CARD_GAP  = 8;
const CARD_W    = Math.floor((960 - CARD_PAD * 2 - CARD_GAP * 3) / 4);  // 226

const METRIC_W  = 192;  // 960 / 5

// Fader de velocidad (en header, esquina derecha)
const SPD_W  = 42;
const SPD_H  = 26;
const SPD_G  = 4;
const SPD_X0 = 960 - CARD_PAD - SPEED_OPTS.length * (SPD_W + SPD_G) + SPD_G;  // ≈ 670
const SPD_Y  = 9;

const FONT = "'Open Sans', sans-serif";

export class CarreraScene extends Scene {
    private carro!:    Carro;
    private circuito!: Circuito;
    private rivales!:  Rival[];
    private estado!:   EstadoCarrera;

    private circuitoRenderer!: CircuitoRenderer;

    // Progreso en pista del jugador y del rival (0–1, cruzar 1 = nueva vuelta)
    private progresoVehiculo = 0;
    private rivalProgress    = 0;

    // Sector visual activo
    private sectorVisual = 'S1';

    // Startup: real-ms transcurridos desde el inicio (solo vuelta 0)
    private startupTimer = 0;

    // Velocidad media del circuito (km/h ponderada por fracción de pista)
    private avgSectorSpeed!: number;

    // Render speed multiplier (fader)
    private speedMult: SpeedMult = 1;
    private speedBtnBgs: GameObjects.Graphics[] = [];

    // Flag para evitar múltiples llamadas a terminarCarrera
    private juegoTerminado = false;

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
        this.circuito         = getCircuito('circuito_alfa');
        this.rivales          = generarRivales(1, 1);
        this.estado           = this.crearEstadoInicial();
        this.speedMult        = 1;
        this.juegoTerminado   = false;
        this.progresoVehiculo = 0;
        this.rivalProgress    = 0;
        this.startupTimer     = 0;
        this.speedBtnBgs      = [];
        this.sectorCardBg     = [];
        this.sectorCardTxt    = [];
        this.sectorCardSpeed  = [];
        this.sectorCardName   = [];
        this.metricBars       = [];
        this.metricTexts      = [];
        this.sectorVisual     = 'S1';

        // Velocidad media para normalizar el factor de velocidad por sector
        this.avgSectorSpeed = this.calcularVelocidadMedia();

        this.dibujarFondo();
        this.dibujarHeader();
        this.crearCircuito();
        this.crearSectorCards();
        this.crearMetricsStrip();
        this.actualizarUI();
    }

    // ── Update ────────────────────────────────────────────────────────────────
    update(_t: number, delta: number) {
        if (this.juegoTerminado) return;

        // ── Standing-start ramp (solo en vuelta 0) ────────────────────────────
        if (this.estado.vueltaActual === 0) {
            this.startupTimer += delta;       // ms reales, no escala con speedMult
        }
        const startupFactor = this.estado.vueltaActual === 0
            ? Math.min(1, this.startupTimer / STARTUP_MS)
            : 1.0;

        // ── Progreso del jugador ──────────────────────────────────────────────
        const playerFactor = this.factorVelocidad(this.progresoVehiculo) * startupFactor;
        this.progresoVehiculo += delta * this.speedMult * playerFactor / DELAY_BASE_MS;

        // Cruce de la línea de meta → nueva vuelta
        if (this.progresoVehiculo >= 1) {
            this.progresoVehiculo -= 1;
            this.tickVuelta();
            if (this.juegoTerminado) return;
        }

        // ── Progreso del rival (rubber-band) ──────────────────────────────────
        // gapSigned > 0 → rival adelante; < 0 → rival atrás
        const rawGap    = (this.rivalProgress - this.progresoVehiculo + 1) % 1;
        const gapSigned = rawGap > 0.5 ? rawGap - 1 : rawGap;

        // El rival apunta a ~4 % de adelanto si player va 2° o 4 % de retraso si va 1°
        const targetGap  = this.estado.posicion === 2 ? 0.04 : -0.04;
        const correction = (targetGap - gapSigned) * 0.3;

        const rivalFactor = this.factorVelocidad(this.rivalProgress) * (1 + correction) * startupFactor;
        this.rivalProgress = (this.rivalProgress + delta * this.speedMult * rivalFactor / DELAY_BASE_MS + 1) % 1;

        // ── Render vehiculos con línea de carrera ─────────────────────────────
        this.circuitoRenderer.actualizarVehiculo(this.progresoVehiculo, this.rivalProgress);

        // ── Sector activo por posición real del jugador ───────────────────────
        const p   = this.progresoVehiculo;
        const sec = p < FRAC.s2 ? 'S1'
                  : p < FRAC.s3 ? 'S2'
                  : p < FRAC.s4 ? 'S3'
                  :               'S4';
        if (sec !== this.sectorVisual) {
            this.sectorVisual = sec;
            this.actualizarSectorCards(sec);
            this.circuitoRenderer.dibujarCircuito(sec);
        }

        // ── Métricas en tiempo real ───────────────────────────────────────────
        // Velocidad actual del jugador (km/h)
        const spdKmh = Math.round(playerFactor * this.avgSectorSpeed);
        this.metricTexts[4].setText(`${spdKmh} km/h`).setColor('#7ab8e8');

        // Distancia al rival en metros
        const gapM    = Math.round(gapSigned * this.circuito.longitudMetros);
        const gapText = gapM >  5 ? `+${gapM}m`
                      : gapM < -5 ? `${gapM}m`
                      :             'MISMO';
        const gapColor = gapM > 50 ? '#ff4455'
                       : gapM > 5  ? '#ffcc00'
                       : gapM < -50 ? '#4cdf80'
                       : '#d0e8ff';
        this.metricTexts[3].setText(gapText).setColor(gapColor);
    }

    // ── Velocidad media ponderada por longitud de sector ──────────────────────
    private calcularVelocidadMedia(): number {
        const fracs = [FRAC.s2, FRAC.s3 - FRAC.s2, FRAC.s4 - FRAC.s3, 1 - FRAC.s4];
        return this.circuito.sectores.reduce(
            (sum, seg, i) => sum + seg.velocidadPuntaKmh * fracs[i],
            0,
        );
    }

    // ── Factor de velocidad por sector (+ transiciones suaves coseno) ─────────
    // Devuelve un factor relativo a avgSectorSpeed:
    //   > 1 en rectas, < 1 en curvas, interpolado en zonas de transición.
    private factorVelocidad(t: number): number {
        const avg   = this.avgSectorSpeed;
        const v     = this.circuito.sectores.map(s => s.velocidadPuntaKmh);
        const b     = [0, FRAC.s2, FRAC.s3, FRAC.s4, 1] as const;
        const BLEND = 0.22;  // 22 % del sector para frenada/aceleración

        let si = 3;
        if (t < FRAC.s2) si = 0;
        else if (t < FRAC.s3) si = 1;
        else if (t < FRAC.s4) si = 2;

        const sLen  = b[si + 1] - b[si];
        const posIn = (t - b[si]) / sLen;  // 0–1 dentro del sector

        const vCur  = v[si];
        const vPrev = v[(si + 3) % 4];
        const vNext = v[(si + 1) % 4];

        let speed: number;
        if (posIn < BLEND) {
            // Aceleración desde velocidad del sector anterior
            const k = posIn / BLEND;
            speed = vPrev + (vCur - vPrev) * (0.5 - 0.5 * Math.cos(k * Math.PI));
        } else if (posIn > 1 - BLEND) {
            // Frenada hacia velocidad del siguiente sector
            const k = (posIn - (1 - BLEND)) / BLEND;
            speed = vCur + (vNext - vCur) * (0.5 - 0.5 * Math.cos(k * Math.PI));
        } else {
            speed = vCur;
        }

        return speed / avg;
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

        this.crearSpeedFader();

        this.txtPosicion = this.add.text(944, 13, '', {
            fontSize: '18px', fontFamily: FONT, color: '#ffcc00', fontStyle: 'bold',
        }).setOrigin(1, 0);
    }

    // ── Fader de velocidad ────────────────────────────────────────────────────
    private crearSpeedFader() {
        this.add.text(SPD_X0 - 8, SPD_Y + 6, 'VEL', {
            fontSize: '10px', fontFamily: FONT, color: '#4a7898',
        }).setOrigin(1, 0);

        SPEED_OPTS.forEach((speed, i) => {
            const x  = SPD_X0 + i * (SPD_W + SPD_G);
            const bg = this.add.graphics();
            this.speedBtnBgs.push(bg);

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
    }

    // ── Circuito ──────────────────────────────────────────────────────────────
    private crearCircuito() {
        this.circuitoRenderer = new CircuitoRenderer(this);
        this.circuitoRenderer.dibujarCircuito('S1');

        const segs     = this.circuito.sectores;
        const cx       = (CX_L + CX_R) / 2;
        const lblStyle = { fontSize: '11px', fontFamily: FONT, color: '#4a7898' };

        this.add.text(cx,         CY + R + 10, `${segs[0].velocidadPuntaKmh} km/h`, lblStyle).setOrigin(0.5, 0);
        this.add.text(cx,         CY - R - 24, `${segs[2].velocidadPuntaKmh} km/h`, lblStyle).setOrigin(0.5, 0);
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

    // ── Métricas strip ────────────────────────────────────────────────────────
    // Motor desactivado → solo llantas con barra.
    // Velocidad y distancia al rival se actualizan en update() cada frame.
    private crearMetricsStrip() {
        const labels = ['POSICIÓN', 'VUELTA', 'LLANTAS', 'DIST. RIVAL', 'VEL. ACTUAL'];
        const hasBar  = [false, false, true, false, false];  // solo barra de llantas

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
            posicion:          2,    // 1 rival, player empieza 2°
            desgasteLlantas:   0,
            calorMotor:        20,   // fijo — motor desactivado
            combustible:       100,  // fijo — combustible desactivado
            durabilidadActual: 100,  // fijo — estructura desactivada
            clima:             'despejado',
            enPitStop:         false,
        };
    }

    // ── Actualizar UI (vuelta, posición, llantas) ─────────────────────────────
    // Llamado sólo en tickVuelta. Velocidad y gap se actualizan en update().
    private actualizarUI() {
        const e = this.estado;

        this.txtVuelta.setText(`VUELTA  ${e.vueltaActual} / ${e.vueltasTotales}`);

        const posColor = e.posicion === 1 ? '#ffcc00' : '#d0e8ff';
        this.txtPosicion.setText(`P${e.posicion}`).setColor(posColor);

        this.metricTexts[0].setText(`P${e.posicion}`).setColor(posColor);
        this.metricTexts[1].setText(`${e.vueltaActual} / ${e.vueltasTotales}`).setColor('#d0e8ff');

        const tiresColor = e.desgasteLlantas > 70 ? '#ff4455'
                         : e.desgasteLlantas > 40 ? '#ffcc00'
                         : '#4cdf80';
        this.metricTexts[2].setText(`${Math.round(e.desgasteLlantas)}%`).setColor(tiresColor);

        // Barra de llantas (único metricBars[0])
        this.actualizarBarra((100 - e.desgasteLlantas) / 100, 0x28b878);
    }

    private actualizarBarra(pct: number, colorBien: number) {
        const x     = 2 * METRIC_W + 14;   // métrica índice 2 (LLANTAS)
        const w     = METRIC_W - 28;
        const fillW = Math.round(Math.max(0, Math.min(1, pct)) * w);
        const g     = this.metricBars[0];

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

    // ── Tick de vuelta (cruce de la línea de meta) ────────────────────────────
    // Motor desactivado → calorMotor no se actualiza.
    // Combustible y durabilidad fijos → no se usan para terminar.
    private tickVuelta() {
        this.estado.vueltaActual++;

        const res = simularVuelta(this.estado, this.carro.stats, this.rivales, this.circuito);

        // Solo posición y desgaste de llantas
        this.estado = {
            ...this.estado,
            posicion:        res.posicion,
            desgasteLlantas: res.desgasteLlantas,
            // calorMotor: se mantiene fijo en 20 (motor desactivado)
        };

        this.actualizarUI();

        if (this.estado.vueltaActual >= VUELTAS_TOTALES) {
            this.terminarCarrera();
        }
    }

    // ── Fin de carrera ────────────────────────────────────────────────────────
    private terminarCarrera() {
        this.juegoTerminado = true;
        const resultado = construirResultado(this.estado);
        const datos: DatosResultadosScene = { resultado, estadoCarrera: this.estado };
        this.time.delayedCall(1200, () => this.scene.start('ResultadosScene', datos));
    }
}
