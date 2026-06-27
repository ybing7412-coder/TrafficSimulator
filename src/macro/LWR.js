/**
 * LWR (Lighthill–Whitham–Richards) first-order macroscopic traffic model.
 *
 * Solved on a ring road (periodic BCs) using Godunov's upwind finite-volume scheme.
 * Time step is chosen automatically to satisfy the CFL stability condition.
 * Travel time to the ring's turnaround point is computed via a backward-in-time
 * Hamilton–Jacobi integration.
 *
 * Ring-road layout:
 *   cells 0 … Nx-1      → top lane,    physical x = 0 → Lx  (left→right)
 *   cells Nx … 2Nx-1    → bottom lane, physical x = Lx → 0  (right→left)
 *   cell  Nx + (Nx-1-i) has the same physical x as top-lane cell i
 */
export class LWRModel {
    /**
     * @param {Object} p
     * @param {number} p.Lx      Road length [m]
     * @param {number} p.Nx      Number of spatial cells per lane
     * @param {number} p.Tmax    Simulation duration [s]
     * @param {number} p.vMax    Free-flow speed [m/s]  (Greenshields model)
     * @param {number} p.rhoMax  Jam density [veh/m]
     */
    constructor(p) {
        this.Lx     = p.Lx;
        this.Nx     = p.Nx;
        this.Tmax   = p.Tmax;
        this.vMax   = p.vMax;
        this.rhoMax = p.rhoMax;

        this.dx     = p.Lx / p.Nx;
        this.dt     = 0.9 * this.dx / p.vMax;   // CFL condition
        this.Nt     = Math.ceil(p.Tmax / this.dt);
        this.dt     = p.Tmax / this.Nt;          // exact subdivision

        this.N_RING = 2 * p.Nx;

        // Cell-centre positions [m]
        this.x = Float32Array.from({ length: p.Nx },     (_, i) => (i + 0.5) * this.dx);
        this.t = Float32Array.from({ length: this.Nt + 1 }, (_, n) => n * this.dt);
    }

    // ─── Physics ──────────────────────────────────────────────────────────────

    /** Greenshields equilibrium velocity [m/s]. */
    velocity(rho) {
        return this.vMax * Math.max(0, 1 - rho / this.rhoMax);
    }

    /** Kinematic wave flux [veh/s]. */
    flux(rho) {
        return rho * this.velocity(rho);
    }

    // ─── Solver ───────────────────────────────────────────────────────────────

    /**
     * Run the full simulation.
     * @param {Function} ic  ic(xMeters) → initial density [veh/m]
     * @returns {{ rho_tx, u_tx, T_top_tx, T_bot_tx }}
     *   rho_tx[n][i]  — density at time step n, ring cell i
     *   u_tx[n][i]    — velocity at time step n, ring cell i
     *   T_top_tx[n][i] — travel time from top-lane cell i to turnaround (x=Lx) [s]
     *   T_bot_tx[n][k] — travel time from bottom-lane cell k to ring end (k=Nx-1) [s]
     */
    solve(ic) {
        const { Nx, Nt, dx, dt, N_RING } = this;

        // Initial conditions — symmetric ring
        let rho = new Float32Array(N_RING);
        for (let i = 0; i < Nx; i++) {
            rho[i]                  = Math.max(0, ic(this.x[i]));  // top
            rho[Nx + (Nx - 1 - i)] = Math.max(0, ic(this.x[i]));  // bottom (mirrored)
        }

        const rho_tx = Array.from({ length: Nt + 1 }, () => new Float32Array(N_RING));
        const u_tx   = Array.from({ length: Nt + 1 }, () => new Float32Array(N_RING));

        for (let i = 0; i < N_RING; i++) {
            rho_tx[0][i] = rho[i];
            u_tx[0][i]   = this.velocity(rho[i]);
        }

        // Godunov upwind scheme on ring (periodic)
        for (let n = 1; n <= Nt; n++) {
            const rhoNew = new Float32Array(N_RING);
            for (let i = 0; i < N_RING; i++) {
                const iL    = (i - 1 + N_RING) % N_RING;
                rhoNew[i] = Math.max(0, rho[i] - (dt / dx) * (this.flux(rho[i]) - this.flux(rho[iL])));
            }
            rho = rhoNew;
            for (let i = 0; i < N_RING; i++) {
                rho_tx[n][i] = rho[i];
                u_tx[n][i]   = this.velocity(rho[i]);
            }
        }

        // Hamilton–Jacobi travel-time (backward sweep from T = Tmax)
        // Destination: top lane → cell Nx-1 (x=Lx),  bottom lane → cell Nx-1 (k=Nx-1, x≈0)
        const VFLOOR = 0.01;  // m/s floor to prevent division by zero
        const T_top = Array.from({ length: Nt + 1 }, () => new Float32Array(Nx));
        const T_bot = Array.from({ length: Nt + 1 }, () => new Float32Array(Nx));
        // Boundary: T = 0 at destination for all n
        // (default Float32Array is zero-initialised)

        for (let n = Nt - 1; n >= 0; n--) {
            // Top lane: cells 0 → Nx-1, advect in +x direction
            for (let i = 0; i < Nx - 1; i++) {
                const v       = Math.max(u_tx[n][i], VFLOOR);
                T_top[n][i]   = T_top[n + 1][i]
                               + dt * (1 + v * (T_top[n + 1][i + 1] - T_top[n + 1][i]) / dx);
            }
            // Bottom lane: cells Nx+0 → Nx+(Nx-1), advect in +k direction
            for (let k = 0; k < Nx - 1; k++) {
                const v      = Math.max(u_tx[n][Nx + k], VFLOOR);
                T_bot[n][k]  = T_bot[n + 1][k]
                              + dt * (1 + v * (T_bot[n + 1][k + 1] - T_bot[n + 1][k]) / dx);
            }
        }

        return { rho_tx, u_tx, T_top_tx: T_top, T_bot_tx: T_bot };
    }

    // ─── Micro-car visualisation ──────────────────────────────────────────────

    /**
     * Build micro-car ring positions for every frame.
     * Cars are passive tracers advected by the macro velocity field.
     * Seeded at t=0 from the initial density distribution.
     *
     * @returns {Array<Array<{s}>>}  frame → [{s}] ring position [m], 0 ≤ s < 2·Lx
     */
    buildMicroCars(rho_tx, u_tx) {
        const { Nx, Nt, dx, dt, N_RING, Lx } = this;
        const CAR_L   = 4.5;       // car length [m]
        const ringLen = 2 * Lx;

        // Bi-linear interpolation of speed at arbitrary ring position s
        const interp = (n, s) => {
            const cf = Math.min(Math.max(s / dx, 0), N_RING - 1);
            const i0 = Math.min(Math.floor(cf), N_RING - 2);
            return u_tx[n][i0] + (cf - i0) * (u_tx[n][i0 + 1] - u_tx[n][i0]);
        };

        // Seed cars from initial density (one car per ~1 veh/m*dx region)
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

            const next = cars.map(c => {
                const spd = Math.max(interp(n, c.s), 0);
                return { s: ((c.s + spd * dt) % ringLen + ringLen) % ringLen };
            });

            next.sort((a, b) => a.s - b.s);

            // Remove cars that are too close (jam resolution)
            const filtered = [];
            for (const c of next) {
                const prev = filtered[filtered.length - 1];
                if (!prev || c.s - prev.s >= CAR_L) filtered.push(c);
            }
            // Also check wraparound gap
            if (filtered.length > 1) {
                while (filtered.length > 1 &&
                       filtered[0].s + ringLen - filtered[filtered.length - 1].s < CAR_L) {
                    filtered.pop();
                }
            }
            cars = filtered;
        }
        return frames;
    }

    // ─── Travel-time helpers ──────────────────────────────────────────────────

    /**
     * Connected travel time for top-lane cell i at frame n:
     * time to reach x=Lx plus time to cross the entire bottom lane.
     * This gives the total ring-completion travel time.
     */
    connectedTopTT(T_top_tx, T_bot_tx, n, i) {
        const bottomCrossTime = Math.max(T_bot_tx[n][0] - T_top_tx[n][this.Nx - 1], 0);
        return T_top_tx[n][i] + bottomCrossTime;
    }
}
