/**
 * LWR (Lighthill–Whitham–Richards) first-order macroscopic traffic model.
 * Direct port of the ring-road demo solver.
 *
 * Ring-road layout (periodic):
 *   cells 0 … Nx-1      → top lane,    physical x = 0 → Lx  (left→right)
 *   cells Nx … 2Nx-1    → bottom lane, physical x = Lx → 0  (right→left)
 *   cell  Nx + (Nx-1-i) has the same physical x as top-lane cell i
 *
 * Numerics:
 *   - Godunov upwind scheme with velocity in m/step (CFL ≤ 0.95 guaranteed)
 *   - Hamilton–Jacobi backward sweep for travel time
 *   - Both schemes ported verbatim from Demos/MacrosimMicrovisualEulerianLWR
 */
export class LWRModel {
    /**
     * @param {Object} p
     * @param {number} p.Lx      Road length [m]
     * @param {number} p.Nx      Number of spatial nodes per lane
     * @param {number} p.Tmax    Simulation duration [s]
     * @param {number} p.vMax    Free-flow speed [m/s]
     * @param {number} p.rhoMax  Jam density [veh/m]
     */
    constructor(p) {
        this.Lx     = p.Lx;
        this.Nx     = p.Nx;
        this.Tmax   = p.Tmax;
        this.vMax   = p.vMax;
        this.rhoMax = p.rhoMax;

        // Node-centred grid (matches demo: x[0]=0, x[Nx-1]=Lx)
        this.dx = p.Lx / (p.Nx - 1);

        // Choose Nt so CFL = vMax*dt/dx ≤ 0.95
        this.Nt = Math.ceil(p.Tmax * p.vMax / (0.95 * this.dx));
        this.dt = p.Tmax / this.Nt;

        // Per-step speed ceiling [m/step] = vMax * dt
        // This is MAX_SPEED_MPDT in the demo. CFL = _vMaxStep / dx ≤ 0.95
        this._vMaxStep = p.vMax * this.dt;

        this.N_RING = 2 * p.Nx;

        this.x = Float32Array.from({ length: p.Nx },     (_, i) => i * this.dx);
        this.t = Float32Array.from({ length: this.Nt + 1 }, (_, n) => n * this.dt);
    }

    // ── Physics ────────────────────────────────────────────────────────────────

    /** Per-step velocity [m/step] — used inside solver (demo's velocity()). */
    _vel(rho) {
        return this._vMaxStep * Math.max(0, 1 - rho / this.rhoMax);
    }

    /** Per-step flux [veh/step] — used inside solver (demo's flux()). */
    _flux(rho) {
        return rho * this._vel(rho);
    }

    /** Physical velocity [m/s] — used for display. */
    velocity(rho) {
        return this.vMax * Math.max(0, 1 - rho / this.rhoMax);
    }

    // ── Solver ─────────────────────────────────────────────────────────────────

    /**
     * Run the full simulation.
     * @param {Function} ic  ic(xMeters) → initial density [veh/m]
     * @returns {{ rho_tx, u_tx, T_top_tx, T_bot_tx }}
     */
    solve(ic) {
        const { Nx, Nt, dx, dt, N_RING } = this;

        // ── Initial conditions (symmetric ring) ──────────────────────────────
        let rho = new Float32Array(N_RING);
        for (let i = 0; i < Nx; i++) {
            const r = Math.max(0, ic(this.x[i]));
            rho[i]                  = r;  // top lane
            rho[Nx + (Nx - 1 - i)] = r;  // bottom lane (mirrored)
        }

        const rho_tx = Array.from({ length: Nt + 1 }, () => new Float32Array(N_RING));
        const u_tx   = Array.from({ length: Nt + 1 }, () => new Float32Array(N_RING));

        for (let i = 0; i < N_RING; i++) {
            rho_tx[0][i] = rho[i];
            u_tx[0][i]   = this._vel(rho[i]);  // stored in m/step
        }

        // ── Godunov upwind (periodic ring) ───────────────────────────────────
        // _flux returns veh/step, so "rho - (fR - fL)/dx" is exact per-step update.
        // No explicit dt factor — it is folded into _vel (same convention as demo).
        for (let n = 1; n <= Nt; n++) {
            const rhoNew = new Float32Array(N_RING);
            for (let i = 0; i < N_RING; i++) {
                const iL  = (i - 1 + N_RING) % N_RING;
                rhoNew[i] = Math.max(0, rho[i] - (this._flux(rho[i]) - this._flux(rho[iL])) / dx);
            }
            rho = rhoNew;
            for (let i = 0; i < N_RING; i++) {
                rho_tx[n][i] = rho[i];
                u_tx[n][i]   = this._vel(rho[i]);  // m/step
            }
        }

        // ── Hamilton–Jacobi travel time (backward sweep) ─────────────────────
        // Formula verbatim from demo:
        //   T[n][i] = T[n+1][i] + dt + ux*(T[n+1][i+1] - T[n+1][i])/dx
        // where ux is in m/step (same as u_tx).
        const VFLOOR = 0.001;  // m/step — keeps HJ stable at low density
        const T_top  = Array.from({ length: Nt + 1 }, () => new Float32Array(Nx));
        const T_bot  = Array.from({ length: Nt + 1 }, () => new Float32Array(Nx));

        // Destination node (Nx-1) = 0 for all n (Float32Array is zero-initialised)
        for (let n = 0; n <= Nt; n++) {
            T_top[n][Nx - 1] = 0;
            T_bot[n][Nx - 1] = 0;
        }

        for (let n = Nt - 1; n >= 0; n--) {
            for (let i = 0; i < Nx - 1; i++) {
                const ux    = Math.max(u_tx[n][i], VFLOOR);
                T_top[n][i] = T_top[n + 1][i] + dt
                            + ux * (T_top[n + 1][i + 1] - T_top[n + 1][i]) / dx;
            }
            for (let k = 0; k < Nx - 1; k++) {
                const ux    = Math.max(u_tx[n][Nx + k], VFLOOR);
                T_bot[n][k] = T_bot[n + 1][k] + dt
                            + ux * (T_bot[n + 1][k + 1] - T_bot[n + 1][k]) / dx;
            }
        }

        return { rho_tx, u_tx, T_top_tx: T_top, T_bot_tx: T_bot };
    }

    // ── Micro-car visualisation ────────────────────────────────────────────────

    /**
     * Build passive-tracer micro-car positions for every frame.
     * @returns {Array<Array<{s}>>}  frames[n] = [{s: ring_position_m}]
     */
    buildMicroCars(rho_tx, u_tx) {
        const { Nx, Nt, dx, N_RING, Lx } = this;
        const CAR_L   = 4.5;
        const ringLen = 2 * Lx;

        // Interpolate stored per-step speed [m/step] at ring position s
        const interp = (n, s) => {
            const cf = Math.min(Math.max(s / dx, 0), N_RING - 1);
            const i0 = Math.min(Math.floor(cf), N_RING - 2);
            return u_tx[n][i0] + (cf - i0) * (u_tx[n][i0 + 1] - u_tx[n][i0]);
        };

        // Seed from t=0 density
        let cars = [];
        let cum = 0, emitted = 0;
        for (let i = 0; i < N_RING; i++) {
            cum += Math.max(rho_tx[0][i], 0) * dx;
            while (emitted + 0.5 <= cum) {
                cars.push({ s: Math.min(i * dx, ringLen - CAR_L) });
                emitted++;
            }
        }

        const frames = Array.from({ length: Nt + 1 }, () => []);

        for (let n = 0; n <= Nt; n++) {
            frames[n] = cars.map(c => ({ s: c.s }));
            if (n === Nt) break;

            // u_tx is m/step, so car displacement per step = speed (no dt multiply)
            const next = cars.map(c => {
                const spd = Math.max(interp(n, c.s), 0);
                return { s: ((c.s + spd) % ringLen + ringLen) % ringLen };
            });

            next.sort((a, b) => a.s - b.s);

            const filtered = [];
            for (const c of next) {
                const prev = filtered[filtered.length - 1];
                if (!prev || c.s - prev.s >= CAR_L) filtered.push(c);
            }
            while (filtered.length > 1 &&
                   filtered[0].s + ringLen - filtered[filtered.length - 1].s < CAR_L) {
                filtered.pop();
            }
            cars = filtered;
        }

        return frames;
    }

    // ── Travel-time helpers ────────────────────────────────────────────────────

    connectedTopTT(T_top_tx, T_bot_tx, n, i) {
        return T_top_tx[n][i] + Math.max(T_bot_tx[n][0] - T_top_tx[n][this.Nx - 1], 0);
    }
}
