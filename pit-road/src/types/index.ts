export type CategoriaPieza =
    'motor' | 'suspension' | 'llantas' | 'transmision' | 'aerodinamica' | 'electronica';

export type RarezaPieza = 'comun' | 'rara' | 'epica';

export type EstadoClimatico =
    'despejado' | 'nublado' | 'lluvia' | 'nieve' | 'tormenta' | 'polvo';

export type ArquetipoRival =
    'velocista' | 'resistente' | 'climatero' | 'tecnico' | 'experimental';

// Racing line strategy chosen by a driver for a given corner sequence.
// late_apex  — brakes deep, tight apex, wide corner exit with exit speed.
// early_apex — turns in early, easy apex, wide exit (vulnerable to overtake).
// optima     — textbook balanced line, minimum time cost.
export type LineaCarrera = 'late_apex' | 'optima' | 'early_apex';

export interface StatsPieza {
    acceleration?: number;
    topSpeed?: number;
    handling?: number;
}

export interface Pieza {
    id: string;
    nombre: string;
    categoria: CategoriaPieza;
    rareza: RarezaPieza;
    stats: StatsPieza;
    climaOptimo?: EstadoClimatico;
    sinergias?: string[];
}

export interface StatsCarro {
    acceleration: number;
    topSpeed: number;
    handling: number;
}

export interface Carro {
    piezas: Partial<Record<CategoriaPieza, Pieza>>;
    stats: StatsCarro;
}

export interface Rival {
    id: string;
    nombre: string;
    arquetipo: ArquetipoRival;
    nivel: number;
    stats: StatsCarro;
    lineaCarrera: LineaCarrera;
    piezasVisibles: Pieza[];
    piezasOcultas: Pieza[];
}

export interface EstadoCarrera {
    vueltaActual: number;
    vueltasTotales: number;
    posicion: number;
    desgasteLlantas: number;
    calorMotor: number;
    combustible: number;
    durabilidadActual: number;
    clima: EstadoClimatico;
    enPitStop: boolean;
}

export interface ResultadoVuelta {
    rendimiento: number;
    posicion: number;
    desgasteLlantas: number;
    calorMotor: number;
    combustible: number;
    durabilidadActual: number;
}

export interface ResultadoCarrera {
    posicionFinal: number;
    vueltasCompletadas: number;
    danoRecibido: number;
    puntosObtenidos: number;
    abandono: boolean;
}

export interface EstadoJuego {
    temporada: number;
    carro: Carro;
    blueprintsDesbloqueados: string[];
    puntosTemporada: number;
}

export interface DatosCarreraScene {
    carro: Carro;
    circuitoId?: string;
    clima?: EstadoClimatico;
}

export interface DatosResultadosScene {
    resultado: ResultadoCarrera;
    estadoCarrera: EstadoCarrera;
    nombreCircuito: string;
}

// ─── Circuito ─────────────────────────────────────────────────────────────────

export type TipoComponente = 'recta' | 'curva_abierta' | 'curva_cerrada' | 'chicane' | 'horquilla';
export type TipoCircuito   = 'paperclip_oval' | 'tecnico' | 'mixto' | 'urbano';
export type TipoSuperficie = 'asfalto' | 'tierra' | 'nieve' | 'mixto';
export type TipoSegmento   = 'recta' | 'curva';

// Each element in the componentes[] array of a circuit definition
export interface ComponenteCircuito {
    tipo:       TipoComponente;
    longitud?:  number;   // recta: metros
    radio?:     number;   // curvas/chicane: radio en metros
    anguloDeg?: number;   // curva_abierta/cerrada: grados (default 90/180)
    dir?:       1 | -1;   // 1 = clockwise/right-turn, -1 = counter-clockwise/left-turn
}

// Circuit definition as stored in circuitos.json
export interface CircuitoDef {
    id:              string;
    nombre:          string;
    tipo:            TipoCircuito;
    tipoSuperficie:  TipoSuperficie;
    vehiculoReferencia: { velocidadPromedioKmh: number; tiempoVueltaSeg: number; };
    componentes:     ComponenteCircuito[];
    perfil: {
        arquetipoBeneficiado: ArquetipoRival;
        arquetipoPerjudicado: ArquetipoRival;
    };
    clima: ModificadoresClima;
}

export interface ModificadoresSegmento {
    acceleration: number;
    topSpeed:     number;
    handling:     number;
}

export interface Segmento {
    id:                  string;
    nombre:              string;
    tipo:                TipoSegmento;
    longitudMetros:      number;
    velocidadEntradaKmh: number;
    velocidadPuntaKmh:   number;
    velocidadSalidaKmh:  number;
    marcha:              number;
    tiempoEstimadoSeg:   number;
    modificadores:       ModificadoresSegmento;
}

export interface PerfilCircuito {
    pesoTopSpeed:         number;
    pesoHandling:         number;
    pesoAcceleration:     number;
    arquetipoBeneficiado: ArquetipoRival;
    arquetipoPerjudicado: ArquetipoRival;
}

export interface ModificadoresClima {
    despejado: ModificadoresSegmento;
    lluvia:    ModificadoresSegmento;
    nieve:     ModificadoresSegmento;
    tormenta:  ModificadoresSegmento;
}

// A single point along the pre-computed circuit path
export interface PuntoRuta {
    x:        number;
    y:        number;
    angulo:   number;   // heading in radians
    distAcum: number;   // normalized cumulative distance [0, 1]
    compIdx:  number;   // index of the component this point belongs to
}

// Fully computed circuit — used by renderer and simulator
export interface CircuitoComputado {
    id:              string;
    nombre:          string;
    tipo:            TipoCircuito;
    tipoSuperficie:  TipoSuperficie;
    vehiculoReferencia: { velocidadPromedioKmh: number; tiempoVueltaSeg: number; };
    sectores:        Segmento[];
    perfil:          PerfilCircuito;
    clima:           ModificadoresClima;
    puntos:          PuntoRuta[];
    fracComienzo:    number[];   // t [0,1] at which each sector starts
    longitudTotal:   number;    // total path length in world units
}
