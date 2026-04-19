# Pit Road — Stack Tecnológico y Arquitectura

## Stack principal

| Capa | Herramienta | Versión | Razón |
|---|---|---|---|
| Motor de juego | Phaser 3 | latest stable | Skills oficiales para Claude Code, escenas, input, audio incluidos |
| Lenguaje | TypeScript | 5.x | Tipos ayudan a Claude Code a generar código más preciso |
| Bundler | Vite | 5.x | HMR rápido, zero config, template oficial de Phaser |
| Editor de pixel art | Aseprite | latest | Estándar industria para pixel art + exporta sprite sheets |
| Atlas de sprites | TexturePacker | latest | Empaqueta sprites de Aseprite en atlas para Phaser |
| Editor de mapas | Tiled Map Editor | latest | Integra directo con Phaser via tilemaps JSON |
| Backend / DB | Supabase | latest | Rankings asíncronos, builds grabados, auth ligera |
| Deploy | Vercel | — | CI/CD automático desde git push, gratis en hobby |

---

## Comando de inicio

```bash
npm create @phaserjs/game@latest pit-road
cd pit-road
npm install
npm run dev
```

Esto genera el template oficial de Phaser 3 + TypeScript + Vite listo para usar.

---

## Configuración base de Phaser

```typescript
// src/main.ts
import Phaser from 'phaser';
import { TallerScene } from './scenes/TallerScene';
import { CarreraScene } from './scenes/CarreraScene';
import { ResultadosScene } from './scenes/ResultadosScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 320,
  height: 180,
  zoom: 3,                    // escala x3 para pixel art
  pixelArt: true,             // nearest-neighbor, sin antialiasing
  roundPixels: true,          // evita subpíxel blurring
  backgroundColor: '#1a1a2e',
  scene: [TallerScene, CarreraScene, ResultadosScene],
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  }
};

new Phaser.Game(config);
```

---

## Arquitectura general

```
pit-road/
├── src/
│   ├── scenes/
│   │   ├── TallerScene.ts        — UI de equipamiento de piezas
│   │   ├── ViajeScene.ts         — mapa top-down con nodos (fase 2)
│   │   ├── CarreraScene.ts       — simulación de carrera por vueltas
│   │   └── ResultadosScene.ts    — pantalla de resultados y puntos
│   ├── systems/
│   │   ├── SimuladorCarrera.ts   — lógica pura de simulación (sin Phaser)
│   │   ├── GeneradorRivales.ts   — genera rivales proceduralmente por arquetipo
│   │   ├── SistemaClima.ts       — estados climáticos, pronóstico, acumulación de nieve
│   │   └── SistemaPiezas.ts      — cálculo de stats del carro, sinergias, rareza
│   ├── data/
│   │   ├── piezas.json           — catálogo de piezas con stats
│   │   ├── circuitos.json        — datos de circuitos (longitud, tipo de pista, clima base)
│   │   └── arquetipos.json       — definición de arquetipos de rivales
│   ├── types/
│   │   └── index.ts              — todas las interfaces TypeScript del proyecto
│   ├── utils/
│   │   ├── random.ts             — utilidades de generación aleatoria seeded
│   │   └── math.ts               — normalización de stats, cálculos de carrera
│   └── main.ts
├── public/
│   └── assets/
│       ├── sprites/              — sprite sheets exportados de Aseprite
│       ├── maps/                 — tilemaps JSON exportados de Tiled
│       └── audio/                — efectos de sonido y música
├── CONTEXT.md
├── STACK.md
├── PLAN.md
└── package.json
```

---

## Principios de arquitectura

### Separación dura: lógica vs rendering
Los sistemas en `src/systems/` no importan nada de Phaser. Solo TypeScript puro.
Esto permite testearlos sin levantar el juego y que Claude Code los genere
con mayor precisión al no depender de la API gráfica.

```typescript
// CORRECTO — SimuladorCarrera.ts no toca Phaser
export class SimuladorCarrera {
  simularVuelta(estadoCarro: EstadoCarro, rivales: Rival[]): ResultadoVuelta { ... }
}

// CORRECTO — CarreraScene.ts usa el simulador y renderiza
export class CarreraScene extends Phaser.Scene {
  private simulador = new SimuladorCarrera();
  update() { this.simulador.simularVuelta(...) }
}
```

### Estado del juego como objeto plano
El estado del juego viaja entre escenas como objeto serializable (JSON-compatible).
No hay estado global mutable — cada escena recibe lo que necesita por `scene.start()`.

```typescript
// Pasar estado entre escenas
this.scene.start('CarreraScene', {
  carro: this.estadoCarro,
  clima: this.climaPronosticado,
  rivales: this.rivalesGenerados
});
```

### Datos en JSON, lógica en TypeScript
Los valores de juego (stats de piezas, definición de arquetipos, parámetros de circuito)
viven en archivos JSON en `src/data/`. La lógica que los interpreta vive en `src/systems/`.
Esto permite ajustar el balance del juego sin tocar código.

---

## Interfaces TypeScript base

```typescript
// src/types/index.ts

export type CategoriaPieza =
  'motor' | 'suspension' | 'llantas' | 'transmision' | 'aerodinamica' | 'electronica';

export type RarezaPieza = 'comun' | 'rara' | 'epica';

export type EstadoClimatico =
  'despejado' | 'nublado' | 'lluvia' | 'nieve' | 'tormenta' | 'polvo';

export type ArquetipoRival =
  'velocista' | 'resistente' | 'climatero' | 'tecnico' | 'experimental';

export interface StatsPieza {
  velocidad?: number;    // 1–10
  agarre?: number;       // 1–10
  durabilidad?: number;  // 1–10
  calor?: number;        // 1–10, menor es mejor
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
  velocidad: number;    // 0–100
  agarre: number;       // 0–100
  durabilidad: number;  // 0–100
  calor: number;        // 0–100, menor es mejor
}

export interface Carro {
  piezas: Partial<Record<CategoriaPieza, Pieza>>;
  stats: StatsCarro;
}

export interface Rival {
  id: string;
  arquetipo: ArquetipoRival;
  nivel: number;          // 1–4, sube con las temporadas
  stats: StatsCarro;
  piezasVisibles: Pieza[];
  piezasOcultas: Pieza[];
}

export interface EstadoCarrera {
  vueltaActual: number;
  vueltasTotales: number;
  posicion: number;
  desgasteLlantas: number;   // 0–100
  calorMotor: number;        // 0–100
  combustible: number;       // 0–100
  durabilidadActual: number; // 0–100
  clima: EstadoClimatico;
  enPitStop: boolean;
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
```

---

## Fórmula de simulación de carrera

```typescript
// Por cada vuelta:
const rendimiento = (
  stats.velocidad * 0.4 +
  stats.agarre    * 0.3 +
  stats.durabilidad * 0.2 +
  (100 - stats.calor) * 0.1   // calor inverso: menos calor = mejor
);

// Modificadores climáticos aplicados al rendimiento del rival y del jugador
const modificadorClimatico: Record<EstadoClimatico, Partial<Record<CategoriaPieza, number>>> = {
  lluvia:    { llantas: 0.6, aerodinamica: 1.2 },
  nieve:     { llantas: 0.4, suspension: 0.7 },
  tormenta:  { electronica: 0.5 },
  polvo:     { motor: 0.7 },
  nublado:   { motor: 0.9 },
  despejado: {}
};

// Pit stop: restaura desgaste de llantas, cuesta 3 vueltas de posición efectiva
```

---

## Supabase — estructura de tablas (fase multijugador)

```sql
-- Builds grabados por temporada
create table builds (
  id uuid primary key default gen_random_uuid(),
  temporada int not null,
  jugador_id uuid references auth.users,
  piezas jsonb not null,
  stats jsonb not null,
  created_at timestamptz default now()
);

-- Resultados de carrera
create table resultados (
  id uuid primary key default gen_random_uuid(),
  temporada int not null,
  carrera int not null,
  jugador_id uuid references auth.users,
  posicion int not null,
  puntos int not null,
  build_id uuid references builds,
  created_at timestamptz default now()
);

-- Ranking por temporada (vista calculada)
create view ranking_temporada as
  select jugador_id, temporada, sum(puntos) as puntos_totales
  from resultados
  group by jugador_id, temporada
  order by puntos_totales desc;
```
