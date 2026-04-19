# Pit Road — Contexto del Proyecto

## Visión general

Juego web de gestión de taller + carrera de resistencia semi-automática con arte en pixel art.
El jugador toma el rol de jefe de mecánica: prepara el carro, elige la ruta de viaje entre
ciudades, y observa cómo su preparación se pone a prueba en una carrera automática de resistencia.

**El jugador nunca controla el carro en pista.** Solo prepara el build, elige rutas
y toma decisiones de pit stop durante la carrera automática.

---

## Referencias de diseño

| Referencia | Mecánica tomada |
|---|---|
| Loop Hero | Ejecución automática + preparación táctica previa al loop |
| Uma Musume | Temporadas, stats que determinan el resultado, progresión por campeonatos |
| Motorsport Manager | Pit stops y decisiones en tiempo real durante carrera automática |
| Top Gear SNES | Estética visual pixel art minimalista, vista trasera pseudo-3D |
| Cars (Pixar) | El viaje entre ciudades como descubrimiento y meta-juego |
| 80 Days (inkle) | Viaje con fecha límite, rutas con trade-offs |
| Backpack Hero | Piezas artesanales con rareza modular |

---

## Loop de juego

```
TALLER → VIAJE → CARRERA → RECOMPENSA → (siguiente carrera de la temporada)
```

### Fase 1 — Taller
- El jugador equipa piezas al carro: motor, suspensión, llantas, transmisión, aerodinámica, electrónica
- Las piezas se encuentran en ruta o se fabrican — nunca se compran en tienda
- Cada pieza tiene stats y rareza (común, rara, épica)
- Las piezas interactúan con el clima esperado y el tipo de circuito

### Fase 2 — Viaje
- Mapa top-down con nodos conectados
- El jugador elige la ruta al circuito con fecha límite (día de la carrera)
- Cada ruta tiene perfil de terreno, clima probable y eventos aleatorios
- En ruta: mini-pruebas, hallazgos de blueprints, artesanos especiales
- La ruta costera sube probabilidad de lluvia; la de montaña trae nieve

### Fase 3 — Carrera de resistencia (semi-automática)
- El carro corre solo — la simulación es por vueltas
- El jugador decide cuándo hacer pit stop y qué cambiar
- El clima puede cambiar durante la carrera
- Stats relevantes: durabilidad, calor del motor, desgaste de llantas, combustible

### Fase 4 — Recompensa
- Materiales, blueprints y puntos de ranking
- Ciertos blueprints persisten entre temporadas (roguelike-lite)

---

## Sistema de piezas

```typescript
interface Pieza {
  id: string;
  nombre: string;
  categoria: 'motor' | 'suspension' | 'llantas' | 'transmision' | 'aerodinamica' | 'electronica';
  rareza: 'comun' | 'rara' | 'epica';
  stats: {
    velocidad?: number;    // 1-10
    agarre?: number;       // 1-10
    durabilidad?: number;  // 1-10
    calor?: number;        // 1-10 (menor es mejor)
  };
  climaOptimo?: 'seco' | 'lluvia' | 'nieve' | 'polvo';
  sinergias?: string[];
}
```

Stats del carro = suma ponderada de las stats de piezas equipadas, normalizada a 0–100.

---

## Sistema climático

6 estados: despejado, nublado, lluvia, nieve, tormenta, polvo/arena.

- El pronóstico es **imperfecto**: probabilidades antes de salir, puede cambiar en carrera
- La ruta elegida sesga las probabilidades (costera = más lluvia, montaña = nieve)
- **Nieve tiene mecánica propia**: acumulación progresiva vuelta a vuelta
  - Vueltas 1–5: nieve fresca, agarre caótico
  - Vueltas 6–12: compactada, estable pero baja
  - Vueltas 13+: casi hielo, desgaste acelerado
  - Si para de nevar: deshielo → condición mixta (intermedia es óptima)
- Severidad progresiva: suave en T1–2, letal en T7+

---

## Rivales con IA

5 arquetipos generados proceduralmente cada temporada:

| Arquetipo | Fortaleza | Debilidad |
|---|---|---|
| El Velocista | Velocidad punta | Lluvia / nieve |
| El Resistente | Durabilidad | Velocidad punta |
| El Climatero | Clima adverso | Condición seca |
| El Técnico | Consistencia | Sinergias ocultas |
| El Experimental | Sorpresa | Impredecible |

- Información parcial en parrilla: algunas piezas visibles, otras ocultas
- Arquetipos derrotados frecuentemente escalan de nivel entre temporadas
- Piezas visibles disminuyen en temporadas avanzadas

---

## Multijugador asíncrono

- Build grabado al terminar carrera → entra al pool de rivales de la temporada
- El build rival se resimula con el clima y rivales de la carrera actual del jugador
- Rankings globales por temporada, puntos dobles en carrera final
- Top 3 recibe blueprints épicos exclusivos (sin ventaja estadística directa)

---

## Monetización — Gacha

- Gacha de skins: cosmético puro
- Gacha de blueprints: acceso anticipado a blueprints siempre obtenibles gratis
- Pase de temporada: cosmético por participación
- Pity duro cada 90 tiradas, pity blando desde tirada 60
- Nunca se venden ventajas de stats ni posiciones garantizadas

---

## Estética

- Pixel art, resolución base 320×180 escalado ×3
- Vehículos sin marcas — la silueta comunica el estilo de manejo
- Inspiración: Cyberpunk 2077 vehicles + mecánica clásica años 60–70
- Vista de viaje: top-down 2D con nodos
- Vista de carrera: trasera pseudo-3D tipo OutRun / Top Gear SNES

---

## Progresión — Roguelike + temporadas

**Se pierde al morir:** piezas únicas, carro actual, relaciones de ruta

**Persiste entre temporadas:** blueprints descubiertos, reputación en ciudades, blueprints de ranking
