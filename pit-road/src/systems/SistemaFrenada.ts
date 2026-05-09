import type { Segmento, StatsCarro } from '../types';

// ── Event types ────────────────────────────────────────────────────────────────
export type TipoEvento = 'frenada_tardia' | 'bloqueo_ruedas';

/**
 * Describes a single braking incident affecting one vehicle.
 *
 * All parameters are computed once at event creation; the per-frame envelope
 * function (efectoInstantaneo) interpolates them over duracionMs.
 */
export interface EventoFrenada {
    /** Classification — mild late-braking vs. full wheel lock-up. */
    tipo:               TipoEvento;

    /** Raw severity 0–1 (affects all derived params). Useful for UI / telemetry. */
    intensidad:         number;

    /**
     * Game-time duration in milliseconds.
     * Advances at speedMult rate so the incident plays out in proportional game
     * time regardless of the viewer's speed-multiplier setting.
     */
    duracionMs:         number;

    /**
     * Minimum speed multiplier reached at peak of the incident (0–1).
     *   0.80 → car is 20% slower at worst (frenada_tardia)
     *   0.60 → car is 40% slower at worst (bloqueo_ruedas)
     */
    factorVelocidadMin: number;

    /**
     * Peak additive lateral widening in pixels.
     * Added to the effective band (same sign as band → pushes outward from the
     * apex, simulating understeer / uncontrolled slide).
     *   2–3 px → mild drift   (frenada_tardia)
     *   4–6 px → large slide  (bloqueo_ruedas, may briefly cross the wall zone)
     */
    factorBandaPico:    number;

    /**
     * Extra tire-wear points applied IMMEDIATELY when the event fires.
     * Simulates a flat-spot from wheel lock-up.
     *   0.3–1.0 pt → late braking
     *   1.5–3.0 pt → full lock-up
     */
    desgasteExtra:      number;
}

// ── Braking system ─────────────────────────────────────────────────────────────
export class SistemaFrenada {

    // ── Probability ────────────────────────────────────────────────────────────

    /**
     * Returns the probability [0, 1] of a braking incident when a vehicle enters
     * the given curve sector.
     *
     * Formula:
     *   p = BASE × (desgaste/100)² × factorDificultadCurva × handlingReduction
     *
     * Rationale:
     *   • Quadratic tire wear  → near-zero at fresh tyres, rapidly grows past 60%.
     *   • factorDificultadCurva (0–1 in JSON) → tighter/faster curves are riskier.
     *     This field is the primary procedural track-building lever.
     *   • handlingReduction   → better handling reduces probability by up to 50%.
     *     (handling = 0 → factor 1.00; handling = 100 → factor 0.50)
     *   • BASE = 0.25 → at maximum desgaste + worst curve + no handling:
     *     p ≈ 0.25 (25% per sector entry), which is meaningful but not constant.
     *
     * @param sector   The Segmento being entered (must be tipo === 'curva').
     * @param desgaste Current tire wear [0, 100].
     * @param stats    Vehicle stats — handling is the relevant variable.
     */
    static probabilidad(
        sector:   Segmento,
        desgaste: number,
        stats:    StatsCarro,
    ): number {
        if (sector.tipo !== 'curva') return 0;

        const fdC            = sector.factorDificultadCurva ?? 0.50;
        const wearFactor     = (desgaste / 100) ** 2;
        const handlingReduction = 1 - (stats.handling / 100) * 0.50;

        return 0.25 * wearFactor * fdC * handlingReduction;
    }

    // ── Event generation ───────────────────────────────────────────────────────

    /**
     * Rolls once per curve-sector entry.
     *
     * Returns null if no incident occurs, or an EventoFrenada describing the
     * incident's profile.  All magnitudes are scaled by stats:
     *   • handling    → reduces severity (factorVelocidadMin closer to 1, less band)
     *   • acceleration → reduces duration (faster recovery = less time to re-accelerate)
     *
     * Event distribution: 55% frenada_tardia / 45% bloqueo_ruedas.
     */
    static evaluarEntrada(
        sector:   Segmento,
        desgaste: number,
        stats:    StatsCarro,
    ): EventoFrenada | null {
        if (Math.random() >= SistemaFrenada.probabilidad(sector, desgaste, stats)) {
            return null;
        }

        // Stats influence ─────────────────────────────────────────────────────
        // handlingF : [0.50 great] → [1.00 poor]  — scales speed drop + band
        // accelF    : [0.50 great] → [1.00 poor]  — scales duration (recovery time)
        const handlingF = 1 - stats.handling    / 200;
        const accelF    = 1 - stats.acceleration / 200;

        const isSevere = Math.random() > 0.55;   // 45% chance of full lock-up

        if (!isSevere) {
            // ── frenada_tardia ─ late braking, brief speed dip ────────────────
            // severity 0.4–1.0 so even the mildest late-braking event is noticeable
            const sev = 0.40 + Math.random() * 0.60;
            return {
                tipo:               'frenada_tardia',
                intensidad:         sev,
                // Duration: base 500–1200ms, reduced proportionally by acceleration stat
                duracionMs:         (500  + Math.random() * 700)  * (0.55 + accelF * 0.90),
                // Speed drop: up to 18% at worst handling + full severity
                factorVelocidadMin: 1 - sev * 0.18 * handlingF,
                // Lateral slide: up to ~2.5 px extra at full severity + poor handling
                factorBandaPico:    sev * 2.5 * handlingF,
                // Flat-spot: 0.1–1.0 pt of immediate extra wear
                desgasteExtra:      sev * 1.0,
            };
        } else {
            // ── bloqueo_ruedas ─ full lock-up, hard speed drop + big slide ────
            const sev = 0.50 + Math.random() * 0.50;
            return {
                tipo:               'bloqueo_ruedas',
                intensidad:         sev,
                // Duration: base 1000–2400ms, reduced by acceleration stat
                duracionMs:         (1000 + Math.random() * 1400) * (0.55 + accelF * 0.90),
                // Speed drop: up to 40% at worst handling + full severity
                factorVelocidadMin: 1 - sev * 0.40 * handlingF,
                // Lateral slide: up to ~5 px extra — may push car into the wall zone
                factorBandaPico:    sev * 5.0 * handlingF,
                // Flat-spot: 0.75–2.5 pt of immediate extra wear
                desgasteExtra:      sev * 2.5,
            };
        }
    }

    // ── Per-frame envelope ─────────────────────────────────────────────────────

    /**
     * Computes the instantaneous speed factor and band offset for an active
     * event given elapsed game-time.
     *
     * Envelope shape (normalised t = elapsed / duracionMs):
     *   0   – 0.15 : ramp-in  — snap into the incident (0 → 1)
     *   0.15 – 0.60 : peak     — held at worst effect   (1)
     *   0.60 – 1.00 : recovery — gradual re-acceleration (1 → 0)
     *
     * Returns:
     *   factorVelocidad — multiply into the vehicle's speed factor each frame
     *   bandOffset      — add to the effective band (outward slide, pixels)
     */
    static efectoInstantaneo(
        evento:    EventoFrenada,
        elapsedMs: number,
    ): { factorVelocidad: number; bandOffset: number } {
        const t   = Math.min(1, Math.max(0, elapsedMs / evento.duracionMs));
        let   env: number;

        if      (t < 0.15) env = t / 0.15;                       // ramp-in
        else if (t < 0.60) env = 1.0;                            // peak
        else               env = 1 - (t - 0.60) / (1.0 - 0.60); // recovery

        return {
            factorVelocidad: 1 - (1 - evento.factorVelocidadMin) * env,
            bandOffset:      evento.factorBandaPico * env,
        };
    }
}
