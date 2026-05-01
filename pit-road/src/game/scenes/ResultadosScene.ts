import { Scene } from 'phaser';
import type { DatosResultadosScene } from '../../types';
import { estilos } from '../../utils/estilos';

const MEDALLAS  = ['ORO', 'PLATA', 'BRONCE', '4°', '5°', '6°'];
const COLOR_POS = ['#ffcc00', '#cccccc', '#cc8833', '#aaaaaa', '#aaaaaa', '#aaaaaa'];

export class ResultadosScene extends Scene {
    constructor() { super('ResultadosScene'); }

    init(datos: DatosResultadosScene) {
        this.registry.set('ultimoResultado', datos);
    }

    create() {
        const { resultado, estadoCarrera }: DatosResultadosScene = this.registry.get('ultimoResultado');

        this.add.text(4, 5, 'RESULTADOS', estilos.titulo);

        const posStr   = MEDALLAS[resultado.posicionFinal - 1] ?? `${resultado.posicionFinal}°`;
        const posColor = COLOR_POS[resultado.posicionFinal - 1] ?? '#aaaaaa';

        this.add.text(4,  26, 'Posición final:', estilos.muted);
        this.add.text(110, 24, posStr, { ...estilos.destacado, color: posColor });

        this.add.text(4, 54, `Puntos obtenidos    : ${resultado.puntosObtenidos}`, estilos.normal);
        this.add.text(4, 70, `Vueltas completadas : ${resultado.vueltasCompletadas}`, estilos.normal);
        this.add.text(4, 86, `Daño al carro       : ${resultado.danoRecibido}%`, estilos.normal);

        if (resultado.abandono) {
            this.add.text(4, 102, '¡ABANDONO!', estilos.peligro);
        }

        const yEstado = resultado.abandono ? 120 : 106;
        this.add.text(4, yEstado, 'Estado final del carro:', estilos.muted);
        this.add.text(4, yEstado + 16, `Llantas   : ${Math.round(estadoCarrera.desgasteLlantas)}% desgaste`, estilos.metricas);
        this.add.text(4, yEstado + 30, `Motor     : ${Math.round(estadoCarrera.calorMotor)}° calor`,          estilos.metricas);
        this.add.text(4, yEstado + 44, `Combustib.: ${Math.round(estadoCarrera.combustible)}% restante`,      estilos.metricas);
        this.add.text(4, yEstado + 58, `Estructura: ${Math.round(estadoCarrera.durabilidadActual)}% intacta`, estilos.metricas);

        const boton = this.add.rectangle(4, 160, 160, 18, 0x1a4a1a)
            .setOrigin(0, 0)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.scene.start('TallerScene'))
            .on('pointerover', () => boton.setFillStyle(0x236023))
            .on('pointerout',  () => boton.setFillStyle(0x1a4a1a));
        this.add.text(16, 164, '◀  VOLVER AL TALLER', estilos.exito);
    }
}
