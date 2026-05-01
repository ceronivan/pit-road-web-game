import type { Rival, ArquetipoRival, StatsCarro, Pieza } from '../types';
import { aplicarTradeoffs } from './SimuladorCarrera';
import piezasData from '../data/piezas.json';

const NOMBRES_RIVALES: Record<ArquetipoRival, string[]> = {
    velocista:    ['Rayo Sánchez',   'Flash Morales',  'Turbo Vega'],
    resistente:   ['Fierro Ramos',   'Bloque Herrera', 'Acero Ríos'],
    climatero:    ['Tormenta Cruz',  'Niebla Vargas',  'Lluvia Torres'],
    tecnico:      ['Precisión Gil',  'Cálculo Mejía',  'Datos Ruiz'],
    experimental: ['Locura Pérez',   'Caos Jiménez',   'Raro Mendoza'],
};

// Rangos [min, max] por arquetipo para las 3 variables maestras
const RANGOS: Record<ArquetipoRival, { acceleration: [number, number]; topSpeed: [number, number]; handling: [number, number] }> = {
    velocista:    { acceleration: [75, 90], topSpeed: [80, 95], handling: [30, 50] },
    resistente:   { acceleration: [50, 65], topSpeed: [55, 70], handling: [60, 75] },
    climatero:    { acceleration: [55, 70], topSpeed: [50, 65], handling: [70, 85] },
    tecnico:      { acceleration: [60, 75], topSpeed: [60, 75], handling: [65, 80] },
    experimental: { acceleration: [40, 95], topSpeed: [40, 95], handling: [40, 95] },
};

const ARQUETIPOS: ArquetipoRival[] = ['velocista', 'resistente', 'climatero', 'tecnico', 'experimental'];

function enRango([min, max]: [number, number], nivel: number): number {
    const escala = 1 + (nivel - 1) * 0.08; // +8% por nivel
    const valor  = min + Math.random() * (max - min);
    return Math.min(100, Math.max(1, Math.round(valor * escala)));
}

function statsParaArquetipo(arquetipo: ArquetipoRival, nivel: number): StatsCarro {
    const r = RANGOS[arquetipo];
    const raw: StatsCarro = {
        acceleration: enRango(r.acceleration, nivel),
        topSpeed:     enRango(r.topSpeed,     nivel),
        handling:     enRango(r.handling,     nivel),
    };
    return aplicarTradeoffs(raw); // los rivales también sufren trade-offs
}

function piezasAleatorias(cantidad: number): Pieza[] {
    return [...(piezasData as Pieza[])]
        .sort(() => Math.random() - 0.5)
        .slice(0, cantidad);
}

export function generarRivales(cantidad: number, nivel: number = 1): Rival[] {
    const arquetiposMezclados = [...ARQUETIPOS].sort(() => Math.random() - 0.5);

    return Array.from({ length: cantidad }, (_, i) => {
        const arquetipo   = arquetiposMezclados[i % ARQUETIPOS.length];
        const nombres     = NOMBRES_RIVALES[arquetipo];
        const nombre      = nombres[Math.floor(Math.random() * nombres.length)];
        const stats       = statsParaArquetipo(arquetipo, nivel);
        const todasPiezas = piezasAleatorias(6);

        return {
            id:             `rival_${i}_${Date.now()}`,
            nombre,
            arquetipo,
            nivel,
            stats,
            piezasVisibles: todasPiezas.slice(0, 3),
            piezasOcultas:  todasPiezas.slice(3),
        };
    });
}
