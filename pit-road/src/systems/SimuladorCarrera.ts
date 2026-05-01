import type {
    StatsCarro, EstadoCarrera, EstadoClimatico,
    ResultadoVuelta, ResultadoCarrera, Rival,
    CategoriaPieza, Pieza, Circuito, Segmento,
    ModificadoresSegmento
} from '../types';
import circuitosData from '../data/circuitos.json';

// ─── Pesos de contribución: categoría → variable maestra ─────────────────────
const PESOS: Record<CategoriaPieza, Partial<Record<keyof StatsCarro, number>>> = {
    motor:        { acceleration: 0.45, topSpeed: 0.40, handling: 0.00 },
    transmision:  { acceleration: 0.30, topSpeed: 0.30, handling: 0.05 },
    aerodinamica: { acceleration: 0.00, topSpeed: 0.20, handling: 0.25 },
    suspension:   { acceleration: 0.05, topSpeed: 0.00, handling: 0.40 },
    llantas:      { acceleration: 0.15, topSpeed: 0.05, handling: 0.25 },
    electronica:  { acceleration: 0.05, topSpeed: 0.05, handling: 0.05 },
};

const PUNTOS_POR_POSICION = [15, 12, 10, 7, 4, 1];

// Los climas extendidos (nublado, polvo) no tienen entrada propia en ModificadoresClima
// del circuito — los mapeamos al modificador más cercano.
const CLIMA_FALLBACK: Record<EstadoClimatico, keyof Circuito['clima']> = {
    despejado: 'despejado',
    nublado:   'despejado',   // condición muy parecida a seco
    lluvia:    'lluvia',
    nieve:     'nieve',
    tormenta:  'tormenta',
    polvo:     'lluvia',      // penalización similar a lluvia
};

// ─── Carga de circuito ────────────────────────────────────────────────────────
export function getCircuito(id: string): Circuito {
    return (circuitosData as Circuito[]).find(c => c.id === id) as Circuito;
}

// ─── Trade-offs: ningún carro puede ser perfecto ──────────────────────────────
export function aplicarTradeoffs(stats: StatsCarro): StatsCarro {
    const penaltyAccelToHandling = Math.max(0, (stats.acceleration - 70) * 0.40);
    const penaltySpeedToAccel    = Math.max(0, (stats.topSpeed     - 70) * 0.30);
    const penaltyHandlingToSpeed = Math.max(0, (stats.handling     - 70) * 0.35);

    return {
        acceleration: Math.min(100, Math.max(0, stats.acceleration - penaltySpeedToAccel)),
        topSpeed:     Math.min(100, Math.max(0, stats.topSpeed     - penaltyHandlingToSpeed)),
        handling:     Math.min(100, Math.max(0, stats.handling     - penaltyAccelToHandling)),
    };
}

// ─── Calcula stats del carro desde piezas equipadas ──────────────────────────
export function calcularStatsCarro(piezas: Partial<Record<CategoriaPieza, Pieza>>): StatsCarro {
    const raw: StatsCarro = { acceleration: 0, topSpeed: 0, handling: 0 };

    for (const [categoria, pieza] of Object.entries(piezas) as [CategoriaPieza, Pieza][]) {
        if (!pieza) continue;
        const pesos = PESOS[categoria];
        const s     = pieza.stats;
        raw.acceleration += (s.acceleration ?? 0) * 10 * (pesos.acceleration ?? 0);
        raw.topSpeed     += (s.topSpeed     ?? 0) * 10 * (pesos.topSpeed     ?? 0);
        raw.handling     += (s.handling     ?? 0) * 10 * (pesos.handling     ?? 0);
    }

    const BASE = 60;
    const normalizado: StatsCarro = {
        acceleration: Math.min(100, Math.round((raw.acceleration / BASE) * 100)),
        topSpeed:     Math.min(100, Math.round((raw.topSpeed     / BASE) * 100)),
        handling:     Math.min(100, Math.round((raw.handling     / BASE) * 100)),
    };
    return aplicarTradeoffs(normalizado);
}

// ─── Rendimiento en un segmento específico ────────────────────────────────────
export function calcularRendimientoEnSegmento(
    stats: StatsCarro,
    segmento: Segmento,
    clima: EstadoClimatico,
    circuito: Circuito
): number {
    const mod: ModificadoresSegmento      = segmento.modificadores;
    const climaMod: ModificadoresSegmento = circuito.clima[CLIMA_FALLBACK[clima]];

    const accel = stats.acceleration * mod.acceleration * climaMod.acceleration;
    const speed = stats.topSpeed     * mod.topSpeed     * climaMod.topSpeed;
    const hand  = stats.handling     * mod.handling     * climaMod.handling;

    return Math.min(100, Math.max(0,
        accel * circuito.perfil.pesoAcceleration +
        speed * circuito.perfil.pesoTopSpeed     +
        hand  * circuito.perfil.pesoHandling
    ));
}

// ─── Rendimiento total de una vuelta (promedio de los 4 sectores) ─────────────
export function calcularRendimientoVuelta(
    stats: StatsCarro,
    clima: EstadoClimatico,
    circuito: Circuito
): number {
    const rendimientos = circuito.sectores.map(seg =>
        calcularRendimientoEnSegmento(stats, seg, clima, circuito)
    );
    return rendimientos.reduce((a, b) => a + b, 0) / rendimientos.length;
}

// ─── Rendimiento base (sin circuito) — usado en TallerScene y tests ──────────
export function calcularRendimiento(stats: StatsCarro): number {
    return (
        stats.acceleration * 0.35 +
        stats.topSpeed     * 0.35 +
        stats.handling     * 0.30
    );
}

// ─── Simula una vuelta usando el circuito activo ──────────────────────────────
export function simularVuelta(
    estado: EstadoCarrera,
    statsJugador: StatsCarro,
    rivales: Rival[],
    circuito: Circuito
): ResultadoVuelta {
    const factorDesgaste = 1 - (estado.desgasteLlantas / 200);
    const factorCalor    = 1 - (Math.max(0, estado.calorMotor - 70) / 100);
    const rendimiento    = calcularRendimientoVuelta(statsJugador, estado.clima, circuito)
                           * factorDesgaste * factorCalor;

    const rendimientosRivales = rivales.map(r =>
        calcularRendimientoVuelta(r.stats, estado.clima, circuito) + (Math.random() * 10 - 5)
    );
    const posicion = rendimientosRivales.filter(r => r > rendimiento).length + 1;

    return {
        rendimiento,
        posicion,
        desgasteLlantas:   Math.min(100, estado.desgasteLlantas  + (3 + Math.random() * 2)),
        calorMotor:        Math.min(100, estado.calorMotor        + (2 + Math.random() * 3)),
        combustible:       Math.max(0,   estado.combustible       - (4 + Math.random() * 1)),
        durabilidadActual: Math.max(0,   estado.durabilidadActual - (1 + Math.random() * 1.5)),
    };
}

// ─── Pit stop ─────────────────────────────────────────────────────────────────
export function aplicarPitStop(estado: EstadoCarrera): EstadoCarrera {
    return {
        ...estado,
        desgasteLlantas: 5,
        calorMotor:      Math.max(30, estado.calorMotor - 40),
        posicion:        Math.min(6, estado.posicion + 3),
        enPitStop:       false,
    };
}

// ─── Puntos y resultado final ─────────────────────────────────────────────────
export function calcularPuntosFinales(posicion: number): number {
    return PUNTOS_POR_POSICION[posicion - 1] ?? 0;
}

export function construirResultado(estado: EstadoCarrera): ResultadoCarrera {
    return {
        posicionFinal:      estado.posicion,
        vueltasCompletadas: estado.vueltaActual,
        danoRecibido:       Math.round(100 - estado.durabilidadActual),
        puntosObtenidos:    calcularPuntosFinales(estado.posicion),
        abandono:           estado.combustible <= 0 || estado.durabilidadActual <= 0,
    };
}
