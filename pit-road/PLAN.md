# Pit Road — Plan de Trabajo

## Estado actual del proyecto

- [x] GDD completo documentado (ver CONTEXT.md)
- [x] Stack tecnológico definido (ver STACK.md)
- [x] Proyecto Phaser inicializado
- [x] Prototipo Fase 1 funcionando
- [x] Refactor stats: 3 variables maestras (acceleration, topSpeed, handling) + trade-offs automáticos
- [x] Crear `src/data/circuitos.json` — nota: circuito_alfa, paperclip oval 1360m, 60s a 100km/h promedio
- [x] Tipos Circuito, Segmento, ModificadoresSegmento añadidos a types/index.ts
- [x] SimuladorCarrera actualizado para usar modificadores por segmento y clima por circuito
- [x] CarreraScene muestra sector activo en UI (S1–S4, nombre y velocidad punta)

---

## Fase 1 — Prototipo mínimo (taller + carrera)

**Objetivo:** validar que el loop taller → carrera sea satisfactorio.
**Criterio de éxito:** después de 5 minutos jugando se siente que cambiar piezas impacta la carrera,
la carrera genera tensión aunque sea automática, y el pit stop se siente como decisión real.

**Lo que NO se construye en fase 1:**
- Sistema de viaje / mapa de rutas
- Clima dinámico
- Arte pixel art real (usar rectángulos de colores)
- Crafting / blueprints
- Multijugador / ranking
- Gacha / monetización

### Tareas

#### 1.1 — Setup del proyecto
- [ ] Crear proyecto: `npm create @phaserjs/game@latest pit-road`
- [ ] Copiar CONTEXT.md, STACK.md y PLAN.md a la raíz del proyecto
- [ ] Verificar que `npm run dev` levanta el servidor sin errores
- [ ] Configurar Phaser con `pixelArt: true`, `zoom: 3`, resolución 320×180

#### 1.2 — Tipos e interfaces
- [ ] Crear `src/types/index.ts` con todas las interfaces del proyecto
  - `Pieza`, `StatsPieza`, `CategoriaPieza`, `RarezaPieza`
  - `Carro`, `StatsCarro`
  - `Rival`, `ArquetipoRival`
  - `EstadoCarrera`, `ResultadoCarrera`
  - `EstadoJuego`

#### 1.3 — Datos de piezas
- [ ] Crear `src/data/piezas.json` con al menos 3 piezas por categoría (18 piezas mínimo)
  - Cada categoría: 1 común, 1 rara, 1 épica
  - Stats balanceados: ninguna pieza debe ser la mejor en todo
  - Ejemplos de nombres: "Flat-6 artesanal", "Slick duras", "Suspensión reforzada"

#### 1.4 — Sistema puro de simulación
- [ ] Crear `src/systems/SimuladorCarrera.ts` (sin imports de Phaser)
  - `calcularStatsCarroTotal(piezas): StatsCarro`
  - `simularVuelta(estadoCarro, rivales, clima): ResultadoVuelta`
  - `aplicarPitStop(estadoCarrera): EstadoCarrera`
  - `calcularPuntosFinales(posicion, vueltas): number`
- [ ] Crear `src/systems/GeneradorRivales.ts`
  - `generarRivales(cantidad, dificultad): Rival[]`
  - Usar arquetipos del GDD con stats en rangos por arquetipo
  - Piezas visibles: 3 de 6 en fase 1

#### 1.5 — Escena Taller
- [ ] Crear `src/scenes/TallerScene.ts`
  - Grid de 6 slots de piezas (uno por categoría)
  - Al hacer click en un slot, mostrar lista de piezas disponibles de esa categoría
  - Mostrar stats resultantes del carro en tiempo real al equipar piezas
  - Mostrar rareza con colores: gris (común), azul (rara), dorado (épica)
  - Botón "IR A CARRERA" que pasa el estado del carro a CarreraScene
  - Para fase 1: el jugador empieza con 2–3 piezas comunes equipadas por defecto

#### 1.6 — Escena Carrera
- [ ] Crear `src/scenes/CarreraScene.ts`
  - Recibe el carro equipado desde TallerScene
  - Genera 5 rivales al inicio con `GeneradorRivales`
  - Simula 20 vueltas con delay de 1.5s entre vueltas (tiempo real, no instantáneo)
  - Muestra representación visual simple: barras de posición de los 6 participantes
  - Muestra métricas en tiempo real: vuelta actual, posición, desgaste llantas, calor motor
  - A mitad de carrera (vuelta 10) el juego pregunta si quiere hacer pit stop:
    - Si acepta: pausa simulación, restaura llantas, pierde 3 posiciones efectivas, reanuda
    - Si rechaza: continúa con desgaste acumulado
  - Al terminar las 20 vueltas: pasa resultado a ResultadosScene

#### 1.7 — Escena Resultados
- [ ] Crear `src/scenes/ResultadosScene.ts`
  - Mostrar posición final (1°–6°)
  - Mostrar puntos obtenidos según tabla del GDD
  - Mostrar estado del carro: cuánto daño recibió
  - Botón "VOLVER AL TALLER" que reinicia el loop
  - Para fase 1: no hay persistencia — cada vuelta al taller resetea el inventario

---

## Fase 2 — Mapa de viaje

**Objetivo:** conectar el taller con la carrera a través del sistema de viaje.
**Prerequisito:** Fase 1 completada y validada jugablemente.

### Tareas

#### 2.1 — Sistema de clima
- [ ] Crear `src/systems/SistemaClima.ts`
  - `generarPronostico(tipRuta): PronosticoClima`
  - `evolucionarClima(estadoActual, vuelta): EstadoClimatico`
  - `calcularModificadorClimatico(clima, pieza): number`
  - Implementar acumulación de nieve vuelta a vuelta
- [ ] Integrar modificadores climáticos en `SimuladorCarrera`

#### 2.2 — Mapa de nodos
- [ ] Diseñar mapa de 12–16 nodos en Tiled Map Editor
  - 3–4 tipos de ruta: costera, interior, montaña, desierto
  - Cada nodo tiene: tipo de terreno, clima probable, evento posible
- [ ] Crear `src/scenes/ViajeScene.ts`
  - Renderizar mapa top-down con nodos clickeables
  - Mostrar fecha límite (N días hasta la carrera)
  - Al clickear un nodo: mostrar preview de evento + confirmar movimiento
  - Al llegar al nodo destino (circuito): ir a TallerScene con clima actualizado

#### 2.3 — Eventos de viaje
- [ ] Crear `src/data/eventos.json` con 15–20 eventos posibles
  - Categorías: hallazgo de pieza, mini-prueba, artesano, evento climático, obstáculo
- [ ] Crear `src/systems/GeneradorEventos.ts`
  - `seleccionarEvento(tipoNodo, temporada): Evento`
  - `resolverMiniPrueba(stats, objetivo): ResultadoPrueba`

---

## Fase 3 — Sistema de piezas completo

**Objetivo:** implementar crafting, rareza real y sistema de blueprints.
**Prerequisito:** Fase 2 completada.

### Tareas

#### 3.1 — Crafting
- [ ] Crear `src/systems/SistemaCrafting.ts`
  - `puedesFabricar(materiales, blueprint): boolean`
  - `fabricarPieza(materiales, blueprint): Pieza`
- [ ] Actualizar TallerScene con sección de crafting
- [ ] Crear `src/data/blueprints.json`

#### 3.2 — Sinergias
- [ ] Implementar `calcularSinergias(piezasEquipadas): BonusSinergia[]`
- [ ] Mostrar sinergias activas en la UI del taller

#### 3.3 — Persistencia roguelike
- [ ] Implementar localStorage para guardar blueprints desbloqueados entre temporadas
- [ ] Implementar lógica de pérdida al destruirse el carro

---

## Fase 4 — Vista de carrera pseudo-3D

**Objetivo:** reemplazar la representación de barras por vista trasera tipo OutRun.
**Prerequisito:** Fase 2 completada.

### Tareas

- [ ] Investigar técnica de pseudo-3D con Phaser (transformaciones de sprites por profundidad)
- [ ] Crear sprite sheet básico del carro en Aseprite (vista trasera, 4 frames)
- [ ] Implementar renderizado de pista con parallax por capas
- [ ] Implementar sprites de rivales escalados por profundidad (más pequeños = más lejos)
- [ ] Mantener la simulación por vueltas como backend — solo cambiar el rendering

---

## Fase 5 — Multijugador asíncrono

**Objetivo:** implementar ranking global y builds grabados por temporada.
**Prerequisito:** Fases 1–3 completadas, cuenta de Supabase creada.

### Tareas

- [ ] Configurar proyecto en Supabase (auth anónima para fase inicial)
- [ ] Crear tablas `builds` y `resultados` (ver STACK.md)
- [ ] Crear `src/systems/SistemaRanking.ts`
  - `grabarBuild(carro, resultado): Promise<void>`
  - `obtenerRivalesJugadores(temporada): Promise<Rival[]>`
  - `obtenerRanking(temporada): Promise<EntradaRanking[]>`
- [ ] Integrar rivales de jugadores reales en CarreraScene (mezclados con IA)
- [ ] Crear pantalla de ranking de temporada

---

## Fase 6 — Arte y audio finales

**Objetivo:** reemplazar placeholders por pixel art real y agregar audio.
**Prerequisito:** todas las mecánicas validadas.

### Tareas

- [ ] Diseñar sprites de carros (3 arquetipos base) en Aseprite
- [ ] Diseñar UI del taller en pixel art
- [ ] Diseñar tiles del mapa de viaje por tipo de región
- [ ] Componer o licenciar música por región
- [ ] Agregar efectos de sonido: motor, llantas, pit stop, clima

---

## Instrucciones para Claude Code

### Al iniciar una sesión
1. Leer CONTEXT.md, STACK.md y PLAN.md antes de escribir cualquier código
2. Verificar qué tareas están marcadas como completadas `[x]` en este archivo
3. Empezar siempre por la primera tarea incompleta de la fase activa

### Orden de construcción dentro de cada fase
```
types/index.ts → data/*.json → systems/*.ts → scenes/*.ts
```
Los tipos primero, los datos después, la lógica pura antes que el rendering.

### Reglas de código
- Nunca importar Phaser en archivos de `src/systems/` — lógica pura únicamente
- Todo estado que viaja entre escenas debe ser serializable (JSON-compatible)
- Cada escena debe poder iniciarse de forma aislada con datos de prueba hardcodeados
- Preferir funciones puras sobre clases con estado cuando sea posible en los sistemas
- Nombrar variables en español para mantener coherencia con el GDD

### Al terminar una tarea
Marcar la tarea como completada en este archivo:
```
- [x] Tarea completada
```
Y agregar una línea de nota si hay algo relevante para la siguiente sesión:
```
- [x] Tarea completada — nota: el modificador climático de nieve usa acumulación logarítmica, no lineal
```

### Si algo no está especificado
Priorizar que **se sienta bien jugarlo** sobre que sea técnicamente correcto.
Ante la duda, implementar la versión más simple primero y dejar un comentario `// TODO: expandir`.
