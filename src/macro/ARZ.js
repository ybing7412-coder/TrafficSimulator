/**
 * ARZ (Aw–Rascle–Zhang) second-order macroscopic traffic model.
 *
 * State variables: density ρ and "momentum" y = ρ(v + p(ρ))
 * where p(ρ) = vf · (ρ/ρmax)^γ  is the pseudo-pressure.
 *
 * Solved with the Rusanov (local Lax-Friedrichs) scheme + operator splitting
 * for the relaxation source term.
 *
 * TODO: implement — see Demos/MacrosimMicrovisualEulerianARZ for reference.
 */
export class ARZModel {
    constructor(p) {
        this.Lx     = p.Lx;
        this.Nx     = p.Nx;
        this.Tmax   = p.Tmax;
        this.vf     = p.vf;
        this.rhoMax = p.rhoMax;
        this.tau    = p.tau;    // relaxation time [s]
        this.gamma  = p.gamma;  // pressure exponent
    }

    pressure(rho) {
        return this.vf * Math.pow(Math.max(rho, 1e-6) / this.rhoMax, this.gamma);
    }

    equilibriumVelocity(rho) {
        return this.vf * Math.pow(Math.max(0, 1 - rho / this.rhoMax), this.gamma);
    }

    solve(_ic) {
        throw new Error('ARZModel.solve() — not yet implemented');
    }
}
