import { Scene, GameObjects } from 'phaser';
import type { Carro, Circuito, EstadoCarrera, Rival, DatosCarreraScene, DatosResultadosScene } from '../../types';
import { generarRivales } from '../../systems/GeneradorRivales';
import { getCircuito, simularVuelta, construirResultado } from '../../systems/SimuladorCarrera';
import { CircuitoRenderer, SECTOR_COLOR, FRAC, CX_L, CX_R, CY, R, BAND_PLAYER, BAND_RIVAL } from '../../ui/CircuitoRenderer';
import { estilos, COLOR } from '../../utils/estilos';

const VUELTAS_TOTALES = 20;

// Tiempo base para una vuelta a ×1 (ms).
// La velocidad real varía por sector, este valor da la escala de referencia.
const DELAY_BASE_MS = 8000;

// Opciones del fader de velocidad
const SPEED_OPTS = [1, 2, 4, 8] as const;
type SpeedMult   = (typeof SPEED_OPTS)[number];

// Standing-start: rampa de aceleración en los primeros N ms reales
const STARTUP_MS = 3200;

// Zonas de proximidad entre carros (píxeles en pantalla — espacio real)
// Zone A: 55–140 px → freno suave (máx  8 %)
// Zone B: 22– 55 px → rebuffo / slipstream (máx +3.5 % para el seguidor)
// Zone C:  0– 22 px → freno de emergencia / colisión (máx 80 % de reducción)
const ZONE_A_PX = 140;
const ZONE_B_PX =  55;
const ZONE_C_PX =  22;

// ── Tailing / maniobra de rebase ─────────────────────────────────────────────
// Ciclo de vida:
//   1. NONE     → TAILING  : carro de 2.° entra a <DRAFT_RANGE_PX del de 1.°
//   2. TAILING  → ATTACKING: tras DRAFT_TIME_MS de seguimiento, lanza el ataque
//   3. ATTACKING → NONE    : rebase completado (gap cambió de signo) o ataque fallido
//
// Los coches cambian su línea de carrera (band) suavemente:
//   • TAILING:   el atacante mueve su band hacia el band del líder (misma línea lateral)
//   • ATTACKING (recta): el atacante vuelve a su band contrario (swing hacia el otro lado)
//   • ATTACKING (curva): el atacante se cierra hacia el interior (apex) y el defensor
//                        se abre forzosamente hacia el exterior
//
// TODO (futuro): el duelIntensity puede servir de multiplicador de desgaste:
//   tireWearRate  *= 1 + duelIntensity * TIRE_WEAR_ATTACK_K
//   engineHeatRate *= 1 + duelIntensity * HEAT_ATTACK_K
const DRAFT_RANGE_PX = 88;   // px: distancia para iniciar tailing (sobre recta)
const DRAFT_EXIT_PX  = 115;  // px: pérdida del rebuffo → abortar tailing
const DRAFT_TIME_MS  = 2400; // ms reales de tailing antes de lanzar el ataque
const BAND_LERP_MS   = 320;  // ms en alcanzar el band objetivo (transición suave)

// ── Duelo (ataque / defensa) ──────────────────────────────────────────────────
// Cuando el 2.° está a menos de ATTACK_RANGE_PX del 1.°, ambos pilotos
// elevan el ritmo: el atacante cancela el freno suave de Zona A y empuja,
// el líder responde con una aceleración defensiva.
//
// TODO (futuro): mapear estos factores a desgaste adicional de llantas/motor:
//   wearMultiplier = 1 + (attackBoost - 1) * WEAR_SENSITIVITY
//   heatMultiplier = 1 + (defenseBoost - 1) * HEAT_SENSITIVITY
const ATTACK_RANGE_PX = 100;  // px: radio de activación del duelo (≈ entre Zona A y B)
const ATTACK_BOOST    = 0.12; // +12 % máx para el atacante (2.° lugar)
const DEFENSE_BOOST   = 0.08; // + 8 % máx para el defensor (1.er lugar)

// ── Layout (960×540) ──────────────────────────────────────────────────────────
const HEADER_H  = 44;
const CARDS_Y   = 430;
const CARDS_H   = 55;
const METRICS_Y = 485;

const CARD_PAD  = 16;
const CARD_GAP  = 8;
const CARD_W    = Math.floor((960 - CARD_PAD * 2 - CARD_GAP * 3) / 4);  // 226

const METRIC_W  = 192;

// Fader de velocidad (header, esquina derecha)
const SPD_W  = 42;
const SPD_H  = 26;
const SPD_G  = 4;
const SPD_X0 = 960 - CARD_PAD - SPEED_OPTS.length * (SPD_W + SPD_G) + SPD_G;
const SPD_Y  = 9;

const FONT = "'Open Sans', sans-serif";

export class CarreraScene extends Scene {
    private carro!:    Carro;
    private circuito!: Circuito;
    private rivales!:  Rival[];
    private estado!:   EstadoCarrera;

    private circuitoRenderer!: CircuitoRenderer;

    private progresoVehiculo = 0;
    private rivalProgress    = 0;

    // Factor de rendimiento del rival en el sector actual (probabilístico)
    // Se re-sortea cada vez que el rival entra en un nuevo sector.
    private rivalSectorFactor  = 1.0;
    private rivalCurrentSector = 'S1';

    // ── Tailing / maniobra de rebase ──────────────────────────────────────────
    private duelPhase: 'none' | 'tailing' | 'attacking' = 'none';
    private duelTimer       = 0;   // ms reales acumulados en fase tailing
    private duelInitGapSign = 0;   // signo del gap al lanzar el ataque (detecta rebase)
    // Líneas de carrera efectivas (interpolan suavemente hacia el objetivo)
    private playerEffBand = BAND_PLAYER;
    private rivalEffBand  = BAND_RIVAL;

    private sectorVisual = 'S1';

    // Startup: ms reales desde el inicio (solo vuelta 0)
    private startupTimer = 0;

    // Velocidad media del circuito (km/h) para normalización del factor
    private avgSectorSpeed!: number;

    private speedMult: SpeedMult = 1;
    private speedBtnBgs: GameObjects.Graphics[] = [];

    private juegoTerminado = false;

    private txtVuelta!:   GameObjects.Text;
    private txtPosicion!: GameObjects.Text;

    private sectorCardBg:    GameObjects.Graphics[] = [];
    private sectorCardTxt:   GameObjects.Text[]     = [];
    private sectorCardSpeed: GameObjects.Text[]     = [];
    private sectorCardName:  GameObjects.Text[]     = [];

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
        this.progresoVehiculo  = 0;
        this.rivalProgress     = 0;
        this.startupTimer      = 0;
        this.rivalSectorFactor  = 1.0;
        this.rivalCurrentSector = 'S1';
        this.speedBtnBgs      = [];
        this.sectorCardBg     = [];
        this.sectorCardTxt    = [];
        this.sectorCardSpeed  = [];
        this.sectorCardName   = [];
        this.metricBars       = [];
        this.metricTexts      = [];
        this.sectorVisual     = 'S1';
        this.duelPhase        = 'none';
        this.duelTimer        = 0;
        this.duelInitGapSign  = 0;
        this.playerEffBand    = BAND_PLAYER;
        this.rivalEffBand     = BAND_RIVAL;

        // Velocidad media real del circuito (integración numérica del perfil)
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

        // ── Standing-start ramp ───────────────────────────────────────────────
        if (this.estado.vueltaActual === 0) this.startupTimer += delta;
        const startupFactor = this.estado.vueltaActual === 0
            ? Math.min(1, this.startupTimer / STARTUP_MS)
            : 1.0;

        // ── Gap entre carros (signed: + = rival adelante, - = jugador adelante)
        const rawGap    = (this.rivalProgress - this.progresoVehiculo + 1) % 1;
        const gapSigned = rawGap > 0.5 ? rawGap - 1 : rawGap;

        // ── Detección de proximidad en espacio de píxeles (distancia euclídea) ──
        // Más fiable que la fracción de pista: captura colisiones en curvas donde
        // ambos carros están cerca en pantalla aunque tengan diferente progreso.
        const playerPos = this.circuitoRenderer.calcularPos(this.progresoVehiculo, this.playerEffBand);
        const rivalPos  = this.circuitoRenderer.calcularPos(this.rivalProgress,    this.rivalEffBand);
        const dx = playerPos.x - rivalPos.x;
        const dy = playerPos.y - rivalPos.y;
        const pixelDist = Math.sqrt(dx * dx + dy * dy);

        let playerProxFactor = 1.0;
        let rivalProxFactor  = 1.0;

        if (pixelDist < ZONE_A_PX) {
            // ¿Quién va detrás? gapSigned > 0 → rival adelante → jugador sigue
            if (pixelDist < ZONE_C_PX) {
                // Zona C — colisión/emergencia: freno fuerte hasta 80 % de reducción
                const raw    = Math.max(0, (ZONE_C_PX - pixelDist) / ZONE_C_PX);
                const brakeF = Math.max(0.20, 1 - raw * 0.80);
                if (gapSigned > 0) playerProxFactor = brakeF;
                else               rivalProxFactor  = brakeF;
            } else if (pixelDist < ZONE_B_PX) {
                // Zona B — rebuffo: el seguidor gana hasta +3.5 % de velocidad
                const raw       = 1 - (pixelDist - ZONE_C_PX) / (ZONE_B_PX - ZONE_C_PX);
                const slipBoost = 1 + raw * 0.035;
                if (gapSigned > 0) playerProxFactor = slipBoost;
                else               rivalProxFactor  = slipBoost;
            } else {
                // Zona A — seguimiento suave: coseno ease-in, máx 8 % de reducción
                const raw       = 1 - (pixelDist - ZONE_B_PX) / (ZONE_A_PX - ZONE_B_PX);
                const intensity = 0.5 - 0.5 * Math.cos(raw * Math.PI);
                const brakeF    = Math.max(0.92, 1 - intensity * 0.08);
                if (gapSigned > 0) playerProxFactor = brakeF;
                else               rivalProxFactor  = brakeF;
            }
        }

        // ── Duelo: ataque del 2.° / defensa del 1.° ──────────────────────────
        // Solo activo entre Zona B y el radio de ataque (55–100 px):
        //   • El atacante cancela el freno suave de Zona A y empuja al límite.
        //   • El líder también acelera para no perder la posición.
        //   • En Zona B / Zona C prevalece la lógica aerodinámica y de colisión.
        let playerAttackBoost = 1.0;
        let rivalAttackBoost  = 1.0;

        if (pixelDist >= ZONE_B_PX && pixelDist < ATTACK_RANGE_PX) {
            const intensity = 1 - (pixelDist - ZONE_B_PX) / (ATTACK_RANGE_PX - ZONE_B_PX);
            if (gapSigned > 0) {
                // Rival adelante → jugador ataca, rival defiende
                playerAttackBoost = 1 + intensity * ATTACK_BOOST;
                rivalAttackBoost  = 1 + intensity * DEFENSE_BOOST;
                playerProxFactor  = 1.0;   // cancela freno suave de Zona A
            } else {
                // Jugador adelante → rival ataca, jugador defiende
                rivalAttackBoost  = 1 + intensity * ATTACK_BOOST;
                playerAttackBoost = 1 + intensity * DEFENSE_BOOST;
                rivalProxFactor   = 1.0;   // cancela freno suave de Zona A
            }
        }

        // ── Tailing / maniobra de rebase ──────────────────────────────────────
        // Helpers: ¿está el carro en recta?
        const onStraight = (t: number) => t < FRAC.s2 || (t >= FRAC.s3 && t < FRAC.s4);
        const pOnStraight = onStraight(this.progresoVehiculo);
        const rOnStraight = onStraight(this.rivalProgress);
        const bothStraight = pOnStraight && rOnStraight;

        // Quién va detrás ahora mismo
        const playerIsAttacker = gapSigned > 0;  // rival adelante → jugador ataca

        // Bandas objetivo esta vuelta (se calculan en el switch)
        let targetPB = BAND_PLAYER;
        let targetRB = BAND_RIVAL;

        switch (this.duelPhase) {

            case 'none':
                // El carro de atrás inicia tailing cuando está suficientemente cerca en recta
                if (pixelDist < DRAFT_RANGE_PX && bothStraight) {
                    this.duelPhase = 'tailing';
                    this.duelTimer = 0;
                }
                break;

            case 'tailing': {
                this.duelTimer += delta;  // tiempo real (independiente del speedMult)

                if (pixelDist > DRAFT_EXIT_PX) {
                    // Perdió el rebuffo → vuelve a líneas normales
                    this.duelPhase = 'none';
                    break;
                }
                // Atacante se pega a la línea del líder (misma coordenada lateral)
                if (playerIsAttacker) {
                    targetPB = BAND_RIVAL;    // jugador entra en la línea interior del rival
                    targetRB = BAND_RIVAL;
                } else {
                    targetRB = BAND_PLAYER;   // rival entra en la línea exterior del jugador
                    targetPB = BAND_PLAYER;
                }
                // Con suficiente tiempo de rebuffo, lanzar el ataque
                if (this.duelTimer >= DRAFT_TIME_MS) {
                    this.duelPhase       = 'attacking';
                    this.duelInitGapSign = Math.sign(gapSigned);
                }
                break;
            }

            case 'attacking': {
                // Detectar rebase completado (gap cambió de signo respecto al inicio)
                const gapFlipped = this.duelInitGapSign !== 0 &&
                                   Math.sign(gapSigned) !== this.duelInitGapSign &&
                                   Math.abs(gapSigned) > 0.005;
                if (gapFlipped || pixelDist > DRAFT_EXIT_PX * 1.3) {
                    this.duelPhase = 'none';
                    break;
                }

                // ¿El atacante está entrando en curva? → maniobra de apertura de curva
                const attackerInCurve = playerIsAttacker ? !pOnStraight : !rOnStraight;

                if (attackerInCurve) {
                    // Curva: atacante cierra al interior (band positivo grande = apex más tenso)
                    //        defensor se abre al exterior (band más negativo = radio mayor)
                    if (playerIsAttacker) {
                        targetPB = BAND_PLAYER + 3;  // +12: curva más cerrada (dentro)
                        targetRB = BAND_RIVAL  - 4;  // −8:  abierto al exterior
                    } else {
                        targetRB = BAND_PLAYER + 3;  // rival se mete por dentro
                        targetPB = BAND_PLAYER - 4;  // jugador se abre
                    }
                } else {
                    // Recta: atacante sale hacia el lado contrario del líder para adelantar
                    // (swing: el atacante estaba en la línea del líder, ahora cambia de carril)
                    if (playerIsAttacker) {
                        targetPB = BAND_PLAYER;  // regresa a su carril natural (opuesto al rival)
                        targetRB = BAND_RIVAL;
                    } else {
                        targetRB = BAND_RIVAL;
                        targetPB = BAND_PLAYER;
                    }
                }
                break;
            }
        }

        // Interpolación suave de los bands efectivos hacia sus objetivos
        const lerpF = Math.min(1, delta / BAND_LERP_MS);
        this.playerEffBand += (targetPB - this.playerEffBand) * lerpF;
        this.rivalEffBand  += (targetRB  - this.rivalEffBand)  * lerpF;

        // ── Borde de pista: freno cuando el carro roza el muro en curva ─────
        const playerWallF = this.factorBordePista(this.progresoVehiculo, this.playerEffBand);
        const rivalWallF  = this.factorBordePista(this.rivalProgress,    this.rivalEffBand);

        // ── Progreso del jugador ──────────────────────────────────────────────
        const playerFactor = this.factorVelocidad(this.progresoVehiculo) * startupFactor * playerProxFactor * playerWallF * playerAttackBoost;
        this.progresoVehiculo += delta * this.speedMult * playerFactor / DELAY_BASE_MS;

        // Cruce de la línea de meta → nueva vuelta
        if (this.progresoVehiculo >= 1) {
            this.progresoVehiculo -= 1;
            this.tickVuelta();
            if (this.juegoTerminado) return;
        }

        // ── Progreso del rival (probabilístico por sector + tope ±5%) ────────
        // Al entrar en cada sector se sortea un factor de rendimiento:
        //   CURVA: 55% buen trazo (98–108%), 45% mal trazo (74–92%)
        //   RECTA: varianza pequeña (94–106%) — diferencias de aceleración
        const rSec = this.rivalProgress < FRAC.s2 ? 'S1'
                   : this.rivalProgress < FRAC.s3 ? 'S2'
                   : this.rivalProgress < FRAC.s4 ? 'S3'
                   :                                'S4';
        if (rSec !== this.rivalCurrentSector) {
            this.rivalCurrentSector = rSec;
            const esCurva = rSec === 'S2' || rSec === 'S4';
            if (esCurva) {
                this.rivalSectorFactor = Math.random() < 0.55
                    ? 0.98 + Math.random() * 0.10   // buen trazo: 98–108 %
                    : 0.74 + Math.random() * 0.18;  // mal trazo:  74–92 %
            } else {
                this.rivalSectorFactor = 0.94 + Math.random() * 0.12; // 94–106 %
            }
        }

        const rivalFactor = this.factorVelocidad(this.rivalProgress)
            * this.rivalSectorFactor * startupFactor * rivalProxFactor * rivalWallF * rivalAttackBoost;
        this.rivalProgress = (this.rivalProgress + delta * this.speedMult * rivalFactor / DELAY_BASE_MS + 1) % 1;

        // Tope duro: el rival nunca puede separarse más de ±5 % del jugador
        const clampRaw = (this.rivalProgress - this.progresoVehiculo + 1) % 1;
        const clampGap = clampRaw > 0.5 ? clampRaw - 1 : clampRaw;
        if (Math.abs(clampGap) > 0.05) {
            this.rivalProgress = (this.progresoVehiculo + Math.sign(clampGap) * 0.05 + 1) % 1;
        }

        // ── Render ────────────────────────────────────────────────────────────
        this.circuitoRenderer.actualizarVehiculo(
            this.progresoVehiculo, this.rivalProgress,
            this.playerEffBand, this.rivalEffBand
        );

        // Sector activo según posición real del jugador
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
        // Velocidad actual en km/h (la función ya devuelve km/h directamente)
        const spdKmh = Math.round(
            this.velocidadInstantanea(this.progresoVehiculo) * startupFactor * playerProxFactor
        );
        this.metricTexts[4].setText(`${spdKmh} km/h`).setColor(
            spdKmh < 85 ? '#e0a030' : spdKmh > 110 ? '#4cdf80' : '#7ab8e8'
        );

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

    // ── Velocidad instantánea (km/h) basada en el perfil del Traction Circle ──
    //
    // RECTA (straight):
    //   0  → FA : aceleración progresiva tras salir de curva   (unwinding)
    //   FA → FB : velocidad punta máxima
    //   FB → 1  : frenada abrupta hacia la próxima curva       (pure braking)
    //
    // CURVA (curve):
    //   0  → F1 : trail braking (frenada combinada con giro)
    //   F1 → F2 : apex / velocidad mínima                      (pure cornering)
    //   F2 → 1  : unwinding + aceleración progresiva           (combined accel+cornering)
    //
    // Las fracciones reflejan la asimetría real:
    //   - Frenada: breve (conductor puede usar todo el límite de frenada)
    //   - Aceleración: larga (limitada por la fuerza lateral aún en juego)
    //
    // Para circuitos con curvas más cerradas (anguloDeg > 180, radioMetros < 60)
    // basta con ajustar velocidadMinimaKmh en el JSON del circuito.
    private velocidadInstantanea(t: number): number {
        const b   = [0, FRAC.s2, FRAC.s3, FRAC.s4, 1] as const;

        let si = 3;
        if      (t < FRAC.s2) si = 0;
        else if (t < FRAC.s3) si = 1;
        else if (t < FRAC.s4) si = 2;

        const sLen  = b[si + 1] - b[si];
        const posIn = (t - b[si]) / sLen;       // 0–1 dentro del sector

        const seg     = this.circuito.sectores[si];
        const vEntry  = seg.velocidadEntradaKmh;
        const vExit   = seg.velocidadSalidaKmh;
        const isCurve = seg.tipo === 'curva';

        // Para curvas: apex = velocidad mínima (ej. 70 km/h)
        // Para rectas: apex = velocidad punta (ej. 120 km/h)
        const vPeak = isCurve
            ? (seg.velocidadMinimaKmh ?? Math.round(seg.velocidadPuntaKmh * 0.875))
            : seg.velocidadPuntaKmh;

        // Cosine ease (suave inicio y fin)
        const ease = (k: number) => 0.5 - 0.5 * Math.cos(Math.min(1, Math.max(0, k)) * Math.PI);

        if (isCurve) {
            const F1 = 0.20;   // fin de trail braking
            const F2 = 0.35;   // fin de apex → inicio de aceleración
            if      (posIn < F1) return vEntry + (vPeak - vEntry) * ease(posIn / F1);
            else if (posIn < F2) return vPeak;
            else                 return vPeak  + (vExit - vPeak)  * ease((posIn - F2) / (1 - F2));
        } else {
            const FA = 0.38;   // aceleración termina (empieza zona de velocidad punta)
            const FB = 0.65;   // frenada empieza (35% de la recta)
            if      (posIn < FA) return vEntry + (vPeak - vEntry) * ease(posIn / FA);
            else if (posIn < FB) return vPeak;
            else                 return vPeak  + (vExit - vPeak)  * ease((posIn - FB) / (1 - FB));
        }
    }

    // ── Factor de velocidad normalizado (0.x – 1.x) ──────────────────────────
    private factorVelocidad(t: number): number {
        return this.velocidadInstantanea(t) / this.avgSectorSpeed;
    }

    // ── Velocidad media real (integración numérica del perfil) ────────────────
    // Garantiza que el factor promedio ≈ 1, manteniendo DELAY_BASE_MS exacto.
    private calcularVelocidadMedia(): number {
        const N = 400;
        let sum = 0;
        for (let i = 0; i < N; i++) {
            sum += this.velocidadInstantanea((i + 0.5) / N);
        }
        return sum / N;
    }

    // ── Freno por proximidad al muro (solo curvas) ────────────────────────────
    // La línea de carrera lleva al carro hasta ~5 px del borde en curva.
    // Si el offset lateral supera el umbral, se aplica una reducción suave.
    //
    //  band=+9 (jugador): en la entrada/salida de curva → wallDist ≈ 5 px → activo
    //  band=-4 (rival):   máx offset = 4 px             → wallDist ≈ 10 px → inactivo
    private factorBordePista(t: number, band: number): number {
        // Solo en sectores de curva (si = 1 → S2, si = 3 → S4)
        const si = t < FRAC.s2 ? 0
                 : t < FRAC.s3 ? 1
                 : t < FRAC.s4 ? 2 : 3;
        if (si !== 1 && si !== 3) return 1.0;

        const boundaries = [0, FRAC.s2, FRAC.s3, FRAC.s4, 1] as const;
        const posIn      = (t - boundaries[si]) / (boundaries[si + 1] - boundaries[si]);

        // Distancia lateral al borde = semiancho_pista − offset_del_banding
        const HALF_TW    = 14;  // TW/2 = 28/2
        const lateralOff = Math.abs(band * Math.cos(2 * Math.PI * posIn));
        const wallDist   = HALF_TW - lateralOff;

        const WALL_THRESH = 8;    // px: por debajo de esto el muro "aprieta"
        const MAX_REDUCE  = 0.07; // máx 7 % de reducción de velocidad
        if (wallDist >= WALL_THRESH) return 1.0;

        const raw = (WALL_THRESH - wallDist) / WALL_THRESH;
        return Math.max(1 - MAX_REDUCE, 1 - raw * MAX_REDUCE);
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
        this.add.text(CX_R - 68, CY - 9, `${segs[1].velocidadMinimaKmh ?? segs[1].velocidadPuntaKmh} km/h`, lblStyle);
        this.add.text(CX_L + 10, CY - 9, `${segs[3].velocidadMinimaKmh ?? segs[3].velocidadPuntaKmh} km/h`, lblStyle);
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
    private crearMetricsStrip() {
        const labels = ['POSICIÓN', 'VUELTA', 'LLANTAS', 'DIST. RIVAL', 'VEL. ACTUAL'];
        const hasBar  = [false, false, true, false, false];

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
            posicion:          2,
            desgasteLlantas:   0,
            calorMotor:        20,   // fijo — motor desactivado
            combustible:       100,  // fijo — combustible desactivado
            durabilidadActual: 100,  // fijo — estructura desactivada
            clima:             'despejado',
            enPitStop:         false,
        };
    }

    // ── Actualizar UI (vuelta, posición, llantas) ─────────────────────────────
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

        this.actualizarBarra((100 - e.desgasteLlantas) / 100, 0x28b878);
    }

    private actualizarBarra(pct: number, colorBien: number) {
        const x     = 2 * METRIC_W + 14;
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
    private tickVuelta() {
        this.estado.vueltaActual++;

        const res = simularVuelta(this.estado, this.carro.stats, this.rivales, this.circuito);

        this.estado = {
            ...this.estado,
            posicion:        res.posicion,
            desgasteLlantas: res.desgasteLlantas,
            // calorMotor: fijo en 20 (motor desactivado)
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
