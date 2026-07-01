/**
 * ARZ (Aw–Rascle–Zhang) second-order macroscopic traffic model.
 * Direct port of Demos/MacrosimMicrovisualEulerianARZ.
 *
 * State: (ρ, y)  where  y = ρ·(v + p(ρ))
 *   p(ρ) = vf·(ρ/ρmax)^γ   pseudo-pressure
 *   v    = y/ρ − p(ρ)       velocity recovered from state
 *
 * Numerics: Rusanov (local Lax-Friedrichs) scheme + operator-split relaxation.
 * Adaptive CFL time-stepping.  Cell-centred ring grid.
 */
export class ARZModel {
    /**
     * @param {Object} p
     * @param {number} p.Lx      Road length [m]
     * @param {number} p.Nx      Spatial cells per lane
     * @param {number} p.Tmax    Simulation time [s]
     * @param {number} p.vf      Free-flow speed [m/s]
     * @param {number} p.rhoMax  Jam density [veh/m]
     * @param {number} p.tau     Relaxation time [s]
     * @param {number} p.gamma   Pressure exponent (1 = linear)
     * @param {number} [p.cfl=0.4]
     */
    constructor(p) {
        this.Lx     = p.Lx;
        this.Nx     = p.Nx;
        this.Tmax   = p.Tmax;
        this.vf     = p.vf;
        this.rhoMax = p.rhoMax;
        this.tau    = p.tau;
        this.gamma  = p.gamma;
        this.cfl    = p.cfl ?? 0.4;

        this.dx     = p.Lx / p.Nx;
        this.N_RING = 2 * p.Nx;

        // Cell-centred coordinates (matches demo)
        this.x = Float32Array.from({ length: this.N_RING }, (_, i) => (i + 0.5) * this.dx);
    }

    // ── Physics ────────────────────────────────────────────────────────────────

    pressure(rho) {
        return this.vf * Math.pow(Math.max(rho, 1e-9) / this.rhoMax, this.gamma);
    }

    equilibriumVelocity(rho) {
        return this.vf * Math.pow(Math.max(0, 1 - Math.max(rho, 0) / this.rhoMax), this.gamma);
    }

    velocityFromState(rho, y) {
        const rs = Math.max(rho, 1e-9);
        return y / rs - this.pressure(rs);
    }

    _flux(rho, y) {
        const v = this.velocityFromState(rho, y);
        return { rho: rho * v, y: y * v };
    }

    // ── Solver ─────────────────────────────────────────────────────────────────

    /**
     * Run the simulation. Adaptive dt — stores every time step.
     * @param {Function} ic  ic(xMeters) → initial density [veh/m]
     * @returns {{ timeTx, rhoTx, vTx, T_top_tx, T_bot_tx }}
     */
    solve(ic) {
        const { Nx, dx, N_RING, Tmax, tau, gamma, cfl } = this;
        const RHO_FLOOR = 0.001;
        const VFLOOR    = 0.1;   // m/s floor for HJ

        // ── Init ─────────────────────────────────────────────────────────────
        let rho = new Float32Array(N_RING);
        let y   = new Float32Array(N_RING);

        for (let i = 0; i < N_RING; i++) {
            // Mirror initial condition on bottom lane (same as demo)
            const xi = i < Nx ? this.x[i] : this.x[N_RING - 1 - i];
            const r0 = Math.max(0, ic(xi));
            const v0 = this.equilibriumVelocity(r0);
            const p0 = this.pressure(r0);
            rho[i] = r0;
            y[i]   = r0 * (v0 + p0);
        }

        const vInit = new Float32Array(N_RING);
        for (let i = 0; i < N_RING; i++) vInit[i] = this.velocityFromState(rho[i], y[i]);

        const timeTx = [0];
        const rhoTx  = [rho.slice()];
        const vTx    = [vInit];

        let t = 0;
        let steps = 0;

        // ── Main loop ─────────────────────────────────────────────────────────
        while (t < Tmax - 1e-9 && steps < 300000) {

            // Wave-speed estimate for adaptive dt
            const pArr = new Float32Array(N_RING);
            const vArr = new Float32Array(N_RING);
            let aMax = 0;
            for (let i = 0; i < N_RING; i++) {
                const rs = Math.max(rho[i], RHO_FLOOR);
                pArr[i] = this.pressure(rs);
                vArr[i] = this.velocityFromState(rs, y[i]);
                aMax = Math.max(aMax, Math.abs(vArr[i]), Math.abs(vArr[i] - gamma * pArr[i]));
            }

            const dt = Math.min(Tmax - t, cfl * dx / Math.max(aMax, 1e-6));

            // Rusanov (local Lax-Friedrichs) interface fluxes
            const fluxRho = new Float32Array(N_RING);
            const fluxY   = new Float32Array(N_RING);
            for (let i = 0; i < N_RING; i++) {
                const iR   = (i + 1) % N_RING;
                const rsR  = Math.max(rho[iR], RHO_FLOOR);
                const pR   = this.pressure(rsR);
                const vR   = this.velocityFromState(rsR, y[iR]);
                const fL   = this._flux(rho[i], y[i]);
                const fR   = this._flux(rho[iR], y[iR]);
                const a    = Math.max(
                    Math.abs(vArr[i]), Math.abs(vArr[i] - gamma * pArr[i]),
                    Math.abs(vR),      Math.abs(vR - gamma * pR)
                );
                fluxRho[i] = 0.5 * (fL.rho + fR.rho) - 0.5 * a * (rho[iR] - rho[i]);
                fluxY[i]   = 0.5 * (fL.y   + fR.y  ) - 0.5 * a * (y[iR]   - y[i]  );
            }

            // Conservative update (density + momentum)
            const rhoNew = new Float32Array(N_RING);
            const yStar  = new Float32Array(N_RING);
            for (let i = 0; i < N_RING; i++) {
                const iL    = (i - 1 + N_RING) % N_RING;
                rhoNew[i] = Math.max(rho[i] - (dt / dx) * (fluxRho[i] - fluxRho[iL]), RHO_FLOOR);
                yStar[i]  = y[i]   - (dt / dx) * (fluxY[i]   - fluxY[iL]);
            }

            // Operator-split relaxation: y → v_eq
            const yNew = new Float32Array(N_RING);
            const vNew = new Float32Array(N_RING);
            for (let i = 0; i < N_RING; i++) {
                const rs   = Math.max(rhoNew[i], RHO_FLOOR);
                const vSt  = this.velocityFromState(rs, yStar[i]);
                const vEq  = this.equilibriumVelocity(rs);
                yNew[i] = yStar[i] + dt * rs * (vEq - vSt) / tau;
                vNew[i] = this.velocityFromState(rs, yNew[i]);
            }

            rho = rhoNew;
            y   = yNew;
            t  += dt;
            steps++;

            timeTx.push(t);
            rhoTx.push(rho.slice());
            vTx.push(vNew);
        }

        // ── HJ travel time (backward sweep, real dt per step) ─────────────────
        const Nt    = timeTx.length - 1;
        const T_top = Array.from({ length: Nt + 1 }, () => new Float32Array(Nx));
        const T_bot = Array.from({ length: Nt + 1 }, () => new Float32Array(Nx));

        for (let n = 0; n <= Nt; n++) {
            T_top[n][Nx - 1] = 0;
            T_bot[n][Nx - 1] = 0;
        }

        // Terminal condition: static TT from final speed field (mirrors demo's computeTerminalTT).
        // Without this, T[Nt] = all-zeros, which causes TT to collapse near t = Tmax.
        const vFinal = vTx[Nt];
        for (let i = Nx - 2; i >= 0; i--) {
            const vs     = Math.max(vFinal[i], VFLOOR);
            T_top[Nt][i] = T_top[Nt][i + 1] + dx / vs;
        }
        for (let k = Nx - 2; k >= 0; k--) {
            const vs     = Math.max(vFinal[Nx + k], VFLOOR);
            T_bot[Nt][k] = T_bot[Nt][k + 1] + dx / vs;
        }

        for (let n = Nt - 1; n >= 0; n--) {
            const dtn  = timeTx[n + 1] - timeTx[n];
            const vRow = vTx[n];
            for (let i = 0; i < Nx - 1; i++) {
                const vs    = Math.max(vRow[i], VFLOOR);
                T_top[n][i] = T_top[n + 1][i]
                            + dtn * (1 + vs * (T_top[n + 1][i + 1] - T_top[n + 1][i]) / dx);
            }
            for (let k = 0; k < Nx - 1; k++) {
                const vs    = Math.max(vRow[Nx + k], VFLOOR);
                T_bot[n][k] = T_bot[n + 1][k]
                            + dtn * (1 + vs * (T_bot[n + 1][k + 1] - T_bot[n + 1][k]) / dx);
            }
        }

        return { timeTx, rhoTx, vTx, T_top_tx: T_top, T_bot_tx: T_bot };
    }

    // ── Micro-car visualisation ────────────────────────────────────────────────

    buildMicroCars(rhoTx, vTx, timeTx) {
        const { Nx, dx, N_RING, Lx } = this;
        const CAR_L   = 4.5;
        const ringLen = 2 * Lx;
        const Nt      = timeTx.length - 1;

        const interp = (n, s) => {
            const cf = Math.min(Math.max(s / dx, 0), N_RING - 1);
            const i0 = Math.min(Math.floor(cf), N_RING - 2);
            return vTx[n][i0] + (cf - i0) * (vTx[n][i0 + 1] - vTx[n][i0]);
        };

        let cars = [];
        let cum = 0, emitted = 0;
        for (let i = 0; i < N_RING; i++) {
            cum += Math.max(rhoTx[0][i], 0) * dx;
            while (emitted + 0.5 <= cum) {
                cars.push({ s: Math.min((i + 0.5) * dx, ringLen - CAR_L) });
                emitted++;
            }
        }

        const frames = Array.from({ length: Nt + 1 }, () => []);

        for (let n = 0; n <= Nt; n++) {
            frames[n] = cars.map(c => ({ s: c.s }));
            if (n === Nt) break;

            const dtn  = timeTx[n + 1] - timeTx[n];
            const next = cars.map(c => {
                const spd = Math.max(interp(n, c.s), 0);
                return { s: ((c.s + spd * dtn) % ringLen + ringLen) % ringLen };
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

    connectedTopTT(T_top_tx, T_bot_tx, n, i) {
        return T_top_tx[n][i] + Math.max(T_bot_tx[n][0] - T_top_tx[n][this.Nx - 1], 0);
    }
}
