/**
 * ColorScale — maps physical traffic quantities to CSS color strings.
 * Each function takes a value and the scale maximum, returns rgb(...).
 */
export const ColorScale = {
    /** Traffic density [veh/m]: blue (free flow) → red (jam) */
    density(rho, maxRho = 0.5) {
        const t = Math.min(1, Math.max(0, rho / maxRho));
        return `rgb(${Math.round(35 + 220 * t)},${Math.round(55 + 120 * (1 - t))},${Math.round(210 - 160 * t)})`;
    },

    /** Travel time [s]: green (fast) → purple (slow) */
    travelTime(tt, maxTT = 600) {
        const t = Math.min(1, Math.max(0, tt / maxTT));
        return `rgb(${Math.round(220 - 150 * t)},${Math.round(70 + 15 * (1 - t))},${Math.round(70 + 150 * t)})`;
    },

    /** Speed [m/s]: blue (fast) → red (slow); inverted density palette */
    speed(v, vMax) {
        return ColorScale.density(Math.max(0, vMax - v), vMax);
    },
};
