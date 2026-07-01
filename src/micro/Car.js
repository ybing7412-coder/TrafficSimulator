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
    step(dt, spaceToLeader, leaderSpeed, isOverallLeader = false) {
        if (this.model === 'ovm') {
            this._stepOVM(dt, spaceToLeader, isOverallLeader);
        } else {
            this._stepIDM(dt, spaceToLeader, leaderSpeed, isOverallLeader);
        }
    }

    // ─── OVM ──────────────────────────────────────────────────────────────────

    _stepOVM(dt, s, isOverallLeader) {
        this.a = this._ovmAcc(s, isOverallLeader);
        this.v = Math.max(0, this.v + this.a * dt);
        this.x += this.v * dt;
    }

    _ovmAcc(s, isOverallLeader) {
        const { r = 0.8, V0 = 30, m = 0.2, bf = 18 } = this.params;
        const bClose = Math.max(5, 4 * Math.pow(this.v / 10, 2));
        if (isOverallLeader || s > 200) return r * (V0 - this.v);
        if (s < bClose) return -r * this.v;
        return r * (V0 * (Math.tanh(m * (s - bf)) - Math.tanh(m * (bClose - bf))) - this.v);
    }

    // ─── IDM ──────────────────────────────────────────────────────────────────

    _stepIDM(dt, s, leaderSpeed, isOverallLeader) {
        this.a = this._idmAcc(s, leaderSpeed, isOverallLeader);
        this.a = Math.max(-10, Math.min(this.a, this.params.a ?? 1.5));
        this.v = Math.max(0, this.v + this.a * dt);
        this.x += this.v * dt;
    }

    _idmAcc(s, leaderSpeed, isOverallLeader) {
        const { a = 1.5, b = 2.0, T = 1.5, v0 = 30, s0 = 2 } = this.params;
        if (isOverallLeader || s > 200) {
            return a * (1 - Math.pow(this.v / Math.max(v0, 0.01), 4));
        }
        const deltaV = this.v - leaderSpeed;
        const sStar = s0 + Math.max(0, this.v * T + this.v * deltaV / (2 * Math.sqrt(a * b)));
        return a * (1 - Math.pow(this.v / Math.max(v0, 0.01), 4) - Math.pow(sStar / Math.max(s, 0.1), 2));
    }

    // ─── MOBIL: pure acceleration query (no state change) ─────────────────────

    peekAcc(gap, leaderSpeed, isOverallLeader = false) {
        return this.model === 'ovm'
            ? this._ovmAcc(gap, isOverallLeader)
            : this._idmAcc(gap, leaderSpeed, isOverallLeader);
    }
}
