/**
 * Car — individual vehicle for microsimulations.
 *
 * Supports two car-following models selectable via `model`:
 *   'ovm' — Optimal Velocity Model  (Bando et al., 1995)
 *   'idm' — Intelligent Driver Model (Treiber et al., 2000)
 *
 * Position x [m] is a ring-road coordinate s ∈ [0, 2·Lx).
 */
export class Car {
    /**
     * @param {Object} p
     * @param {number}  p.id        Unique integer ID
     * @param {number}  p.x         Initial position [m]
     * @param {number}  p.v         Initial speed [m/s]
     * @param {string}  p.color     CSS color for rendering
     * @param {string}  [p.model='ovm']
     * @param {Object}  p.params    Model parameters (see below)
     */
    constructor(p) {
        this.id    = p.id;
        this.x     = p.x;
        this.v     = p.v;
        this.a     = 0;
        this.color = p.color;
        this.model = p.model ?? 'ovm';
        this.params = p.params;

        // Travel-time tracking
        this.remainingTravelTime = Infinity;
        this.hasArrived = false;
    }

    /**
     * Advance one time step using the chosen car-following model.
     * @param {number} dt            Time step [s]
     * @param {number} spaceToLeader Net gap to leader front bumper [m]
     * @param {number} leaderSpeed   Leader speed [m/s]
     * @param {boolean} isLeader     True if no car ahead (free-road behaviour)
     */
    step(dt, spaceToLeader, leaderSpeed, isLeader = false) {
        if (this.model === 'ovm') {
            this._stepOVM(dt, spaceToLeader, isLeader);
        } else {
            this._stepIDM(dt, spaceToLeader, leaderSpeed, isLeader);
        }
    }

    // ─── OVM ──────────────────────────────────────────────────────────────────

    _stepOVM(dt, s, isLeader) {
        const { r = 0.8, V0 = 30, m = 0.2, bf = 18 } = this.params;
        const bClose = Math.max(5, 4 * Math.pow(this.v / 10, 2));

        if (isLeader || s > 200) {
            this.a = r * (V0 - this.v);
        } else if (s < bClose) {
            this.a = -0.9 * this.v;
        } else {
            const desired = V0 * (Math.tanh(m * (s - bf)) - Math.tanh(m * (bClose - bf)));
            this.a = r * (desired - this.v);
        }
        this.v = Math.max(0, this.v + this.a * dt);
        this.x += this.v * dt;
    }

    // ─── IDM ──────────────────────────────────────────────────────────────────

    _stepIDM(dt, s, deltaV, isLeader) {
        const { a = 1.5, b = 2.0, T = 1.5, v0 = 30, s0 = 2 } = this.params;

        if (isLeader || s > 500) {
            this.a = a * (1 - Math.pow(this.v / Math.max(v0, 0.01), 4));
        } else {
            const sStar = s0 + Math.max(0, this.v * T + this.v * deltaV / (2 * Math.sqrt(a * b)));
            this.a = a * (1 - Math.pow(this.v / Math.max(v0, 0.01), 4) - Math.pow(sStar / Math.max(s, 0.1), 2));
        }
        this.a = Math.max(-10, Math.min(this.a, a));
        this.v = Math.max(0, this.v + this.a * dt);
        this.x += this.v * dt;
    }
}
