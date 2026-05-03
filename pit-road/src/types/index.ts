export type CategoriaPieza =
    'motor' | 'suspension' | 'llantas' | 'transmision' | 'aerodinamica' | 'electronica';

export type RarezaPieza = 'comun' | 'rara' | 'epica';

export type EstadoClimatico =
    'despejado' | 'nublado' | 'lluvia' | 'nieve' | 'tormenta' | 'polvo';

export type ArquetipoRival =
    'velocista' | 'resistente' | 'climatero' | 'tecnico' | 'experimental';

// Stats de pieza: contribución cruda a las 3 variables maestras (1–10)
export interface StatsPieza {
    acceleration?: number;  // 1–10
    topSpeed?: number;      // 1–10
    handling?: number;      // 1–10
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

// Stats del carro: valores finales 0–100 con trade-offs ya aplicados
export interface StatsCarro {
    acceleration: number;  // 0–100 — aceleración 0→max
    topSpeed: number;      // 0–100 — velocidad máxima sostenida
    handling: number;      // 0–100 — agarre + estabilidad
}

export interface Carro {
    piezas: Partial<Record<CategoriaPieza, Pieza>>;
    stats: StatsCarro;
}

export interface Rival {
    id: string;
    nombre: string;
    arquetipo: ArquetipoRival;
    nivel: number;           // 1–4
    stats: StatsCarro;
    piezasVisibles: Pieza[];
    piezasOcultas: Pieza[];
}

// durabilidad y calor son estado de carrera, no stats de rendimiento
export interface EstadoCarrera {
    vueltaActual: number;
    vueltasTotales: number;
    posicion: number;
    desgasteLlantas: number;    // 0–100, estado de carrera
    calorMotor: number;         // 0–100, estado de carrera
    combustible: number;        // 0–100
    durabilidadActual: number;  // 0–100
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
    clima?: EstadoClimatico;
    circuitoId?: string;   // 'circuito_alfa' (default) | 'circuito_beta'
}

export interface DatosResultadosScene {
    resultado: ResultadoCarrera;
    estadoCarrera: EstadoCarrera;
}

// ─── Circuito ─────────────────────────────────────────────────────────────────

export type TipoSegmento  = 'recta' | 'curva';
export type TipoSuperficie = 'asfalto' | 'tierra' | 'nieve' | 'mixto';

export interface ModificadoresSegmento {
    acceleration: number;   // multiplicador sobre la variable
    topSpeed:     number;
    handling:     number;
}

export interface Segmento {
    id:                  string;           // 'S1' | 'S2' | 'S3' | 'S4'
    nombre:              string;
    tipo:                TipoSegmento;
    longitudMetros:      number;
    velocidadEntradaKmh: number;
    velocidadPuntaKmh:   number;
    velocidadSalidaKmh:  number;
    velocidadMinimaKmh?: number;           // solo curvas
    radioMetros?:        number;           // solo curvas
    anguloDeg?:          number;           // solo curvas
    bankeoDeg?:          number;           // solo curvas
    marcha:              number;
    tiempoEstimadoSeg:   number;
    modificadores:       ModificadoresSegmento;
    puntos?:             string[];         // 'meta' | 'speed_trap' | 'drs_zone'
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

export interface Circuito {
    id:              string;
    nombre:          string;
    tipo:            'paperclip_oval' | 'tecnico' | 'mixto' | 'urbano';
    longitudMetros:  number;
    tipoSuperficie:  TipoSuperficie;
    vehiculoReferencia: {
        velocidadPromedioKmh: number;
        tiempoVueltaSeg:      number;
    };
    sectores: Segmento[];
    perfil:   PerfilCircuito;
    clima:    ModificadoresClima;
}
