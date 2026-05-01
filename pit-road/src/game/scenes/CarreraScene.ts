import { Scene, GameObjects, Time } from 'phaser';
import type { Carro, Circuito, EstadoCarrera, Rival, DatosCarreraScene, DatosResultadosScene } from '../../types';
import { generarRivales } from '../../systems/GeneradorRivales';
import { getCircuito, simularVuelta, aplicarPitStop, construirResultado } from '../../systems/SimuladorCarrera';
import { estilos } from '../../utils/estilos';

const VUELTAS_TOTALES = 20;
const DELAY_VUELTA_MS = 1500;
const VUELTA_PIT_STOP = 10;

export class CarreraScene extends Scene {
    private carro!: Carro;
    private circuito!: Circuito;
    private rivales!: Rival[];
    private estado!: EstadoCarrera;
    private timer!: Time.TimerEvent;
    private esperandoPitStop = false;

    private textoVuelta!:   GameObjects.Text;
    private textoPosicion!: GameObjects.Text;
    private textoMetricas!: GameObjects.Text;
    private textoSector!:   GameObjects.Text;
    private barrasParticipantes: GameObjects.Rectangle[] = [];

    constructor() { super('CarreraScene'); }

    init(datos: DatosCarreraScene) {
        this.carro = datos.carro ?? {
            piezas: {},
            stats: { acceleration: 50, topSpeed: 50, handling: 50 },
        };
    }

    create() {
        this.circuito = getCircuito('circuito_alfa');
        this.rivales  = generarRivales(5, 1);
        this.estado   = this.crearEstadoInicial();

        this.add.text(4,   4, this.circuito.nombre.toUpperCase(), estilos.titulo);
        this.add.text(170, 4, '20 VUELTAS', estilos.subtitulo);

        this.dibujarParticipantes();
        this.dibujarMetricas();
        this.actualizarUI();

        this.timer = this.time.addEvent({
            delay: DELAY_VUELTA_MS,
            callback: this.tickVuelta,
            callbackScope: this,
            loop: true,
        });
    }

    private crearEstadoInicial(): EstadoCarrera {
        return {
            vueltaActual: 0, vueltasTotales: VUELTAS_TOTALES,
            posicion: 3,     desgasteLlantas: 0,
            calorMotor: 20,  combustible: 100,
            durabilidadActual: 100, clima: 'despejado', enPitStop: false,
        };
    }

    // ── Participantes ──────────────────────────────────────────────────────────
    private dibujarParticipantes() {
        const nombres = ['TÚ', ...this.rivales.map(r => r.nombre.split(' ')[0])];
        const Y0 = 24, ROW_H = 22;

        nombres.forEach((nombre, i) => {
            const y = Y0 + i * ROW_H;
            this.add.text(4, y + 4, nombre.slice(0, 7), {
                ...estilos.normal,
                color: i === 0 ? '#aaffaa' : '#aaaaaa',
            });
            const barra = this.add.rectangle(58, y + 6, 0, 10,
                i === 0 ? 0x22aa44 : 0x333355
            ).setOrigin(0, 0);
            this.barrasParticipantes.push(barra);
        });
    }

    // ── Métricas ───────────────────────────────────────────────────────────────
    private dibujarMetricas() {
        this.textoVuelta   = this.add.text(170, 24, '', estilos.normal);
        this.textoPosicion = this.add.text(170, 40, '', estilos.destacado);
        this.textoMetricas = this.add.text(170, 70, '', estilos.metricas);

        // Sector activo — separador visual
        this.add.rectangle(170, 130, 145, 1, 0x334455).setOrigin(0, 0);
        this.textoSector = this.add.text(170, 134, '', { ...estilos.muted, lineSpacing: 4 });
    }

    private actualizarUI() {
        const e = this.estado;
        this.textoVuelta.setText(`Vuelta ${e.vueltaActual} / ${e.vueltasTotales}`);
        this.textoPosicion.setText(`P${e.posicion}`);
        this.textoMetricas.setText([
            `Llantas : ${Math.round(e.desgasteLlantas)}%`,
            `Calor   : ${Math.round(e.calorMotor)}%`,
            `Combust.: ${Math.round(e.combustible)}%`,
            `Estruc. : ${Math.round(e.durabilidadActual)}%`,
        ]);

        // Sector activo: rota entre S1–S4 según vuelta
        const sectorActivo = this.circuito.sectores[e.vueltaActual % 4];
        this.textoSector.setText([
            `${sectorActivo.id}  ${sectorActivo.nombre}`,
            `Punta: ${sectorActivo.velocidadPuntaKmh} km/h`,
        ]);

        this.actualizarBarras();
    }

    private actualizarBarras() {
        const BARRA_MAX   = 106;
        const rendJugador = Math.max(5, BARRA_MAX - this.estado.posicion * 18);
        this.barrasParticipantes.forEach((barra, i) => {
            const ancho = i === 0 ? rendJugador : Math.max(5, Math.random() * BARRA_MAX);
            barra.setSize(ancho, 10);
        });
    }

    // ── Loop de vuelta ─────────────────────────────────────────────────────────
    private tickVuelta() {
        if (this.esperandoPitStop) return;
        this.estado.vueltaActual++;

        if (this.estado.vueltaActual === VUELTA_PIT_STOP) {
            this.timer.paused = true;
            this.mostrarPromptPitStop();
            return;
        }

        const resultado = simularVuelta(this.estado, this.carro.stats, this.rivales, this.circuito);
        this.estado = {
            ...this.estado,
            posicion:          resultado.posicion,
            desgasteLlantas:   resultado.desgasteLlantas,
            calorMotor:        resultado.calorMotor,
            combustible:       resultado.combustible,
            durabilidadActual: resultado.durabilidadActual,
        };

        this.actualizarUI();

        if (this.estado.vueltaActual >= VUELTAS_TOTALES ||
            this.estado.combustible <= 0 ||
            this.estado.durabilidadActual <= 0) {
            this.terminarCarrera();
        }
    }

    // ── Pit stop ───────────────────────────────────────────────────────────────
    private mostrarPromptPitStop() {
        this.esperandoPitStop = true;
        const c = this.add.container(10, 110);

        const fondo = this.add.rectangle(0, 0, 300, 62, 0x080820, 0.96)
            .setOrigin(0, 0).setStrokeStyle(1, 0x4455cc);
        c.add(fondo);
        c.add(this.add.text(8,  6, '¿PIT STOP?', estilos.subtitulo));
        c.add(this.add.text(8, 22, 'Llantas nuevas — pierdes 3 posiciones', estilos.muted));

        const btnSi = this.add.rectangle(8, 40, 130, 18, 0x1a4a1a)
            .setOrigin(0, 0).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => { this.estado = aplicarPitStop(this.estado); this.cerrarPitStop(c); })
            .on('pointerover', () => btnSi.setFillStyle(0x236023))
            .on('pointerout',  () => btnSi.setFillStyle(0x1a4a1a));
        c.add(btnSi);
        c.add(this.add.text(26, 44, 'SÍ, ENTRAR', estilos.exito));

        const btnNo = this.add.rectangle(148, 40, 144, 18, 0x4a1a1a)
            .setOrigin(0, 0).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.cerrarPitStop(c))
            .on('pointerover', () => btnNo.setFillStyle(0x6a2222))
            .on('pointerout',  () => btnNo.setFillStyle(0x4a1a1a));
        c.add(btnNo);
        c.add(this.add.text(166, 44, 'NO, SEGUIR', { ...estilos.normal, color: '#ffaaaa' }));
    }

    private cerrarPitStop(c: GameObjects.Container) {
        c.destroy();
        this.esperandoPitStop = false;
        this.timer.paused = false;
    }

    // ── Fin de carrera ─────────────────────────────────────────────────────────
    private terminarCarrera() {
        this.timer.remove();
        const resultado = construirResultado(this.estado);
        const datos: DatosResultadosScene = { resultado, estadoCarrera: this.estado };
        this.time.delayedCall(1000, () => this.scene.start('ResultadosScene', datos));
    }
}
