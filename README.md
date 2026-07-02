# Micro–Macro Traffic Simulator by Yiming Bing

A browser-based, multi-model vehicular-traffic simulator that runs **microscopic and
macroscopic models simultaneously and independently** on a shared road geometry, with
mathematically rigorous consistency enforced between the two scales.

Companion implementation to a paper submitted to the Australasian Transport Research
Forum (ATRF) 2026.

**[▶ Launch the live simulator](https://ybing7412-coder.github.io/TrafficSimulator/)**

Quick links to this file:

- [Description](#description)
- [Academic Context](#academic-context)
- [Models](#models)
- [Consistency Framework](#consistency-framework)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Parameters](#parameters)
- [References](#references)
- [License](#license)

## Description

This simulator implements microscopic (car-following) and macroscopic (continuum PDE)
traffic models and runs them **in parallel or independently on various road
configurations**, enabling real-time cross-validation of density and travel-time
predictions between the two modelling scales.

The simulator runs entirely in the browser with no build step, using vector (SVG)
rendering and a modular, object-oriented architecture.

### Features

- **Four simulation configurations** run from identical initial conditions:
  * Micro → Macro visualisation (OVM): macroscopic fields estimated from micro trajectories
  * Macro → Micro visualisation (LWR): vehicles synthesised from the first-order PDE
  * Macro → Micro visualisation (ARZ): vehicles synthesised from the second-order PDE
  * Simultaneous Micro + Macro (OVM + ARZ): both run in parallel with live comparison
- **Consistent fundamental diagram** derived from OVM steady-state via fixed-point bisection
- **Live travel-time colour coding** on both micro and macro layers
- **Micro-to-macro density estimation** via Gaussian kernel density estimation (KDE)
- **Macro-to-micro vehicle synthesis** with collision filtering
- **SVG vector rendering** — resolution-independent, per-element styling for vehicles and obstacles
- **Obstacle modelling** — includes traffic cones, road barriers, and customisable traffic lights
- **Configurable traffic parameters** — max speed, density, relaxation time τ, KDE bandwidth,
  initial density profile (Gaussian / sawtooth / flat)
- **Customisable road geometries** — straight road, circular ring road, linear ring road, and
  on/off-ramps, with configurable lane count and periodic boundary conditions

### Architecture components

- The **core** holds the main simulation loop, time-stepping, and all default parameters.
- The **models** provide the microscopic (OVM) and macroscopic (ARZ, LWR) solvers behind
  a shared `step(dt)` / `getState()` interface.
- The **geometry** defines the road and lane layout.
- The **analysis** performs KDE density estimation and travel-time computation.
- The **render** layer draws model state as SVG, independent of the physics.
- The **ui** exposes the configurable parameter control panel.

## Academic Context

This simulator is the companion implementation to:

> **Consistency of Microscopic and Macroscopic Traffic Simulation Models for
> Simultaneous Parallel Execution**  
> Yiming Bing¹ and Pushkin Kachroo²  
> ¹Sydney Grammar School  ·  ²University of Nevada, Las Vegas  
> *Australasian Transport Research Forum (ATRF) 2026, Sydney, 24–26 November 2026*

The paper establishes consistency between micro and macro models at three levels — the
fundamental diagram, the initial conditions, and real-time state estimation — and
develops a travel-time pseudo-metric space for quantifying cross-model agreement.

## Models

### Microscopic

- **Optimal Velocity Model (OVM)** — car-following model (Bando et al. 1995), enhanced
  here with a dynamic, speed-dependent close-following threshold.

### Macroscopic

- **Aw–Rascle–Zhang (ARZ)** — second-order 2×2 hyperbolic system with a generalised
  momentum equation, solved using Rusanov (local Lax–Friedrichs) fluxes with adaptive
  CFL time stepping.
- **Lighthill–Whitham–Richards (LWR)** — first-order scalar conservation law with a
  Greenshields equilibrium relation, solved with a Godunov-type upwind scheme.

## Consistency Framework

- **Equilibrium velocity from OVM** — the macroscopic equilibrium velocity Ve(ρ) is
  obtained from the OVM steady-state via a fixed-point bisection procedure, so both
  scales share an identical fundamental diagram.
- **Consistent initialisation** — both models are seeded from the same analytical
  density profile ρ₀(x) (Gaussian, sawtooth, or flat).
- **Micro → Macro (aggregation)** — the macroscopic density field is estimated from
  individual vehicle positions via kernel density estimation (bandwidth h = 20 m).
- **Macro → Micro (synthesis)** — individual vehicles are placed within the macroscopic
  density field and advected by the interpolated macro velocity, with collision
  filtering to maintain minimum spacing.
- **Travel-time metric** — a scalar pseudo-metric on average travel time and a functional
  L² metric on the full travel-time field, giving a formal definition of micro–macro
  consistency as convergence under refinement.

## Installation

This simulator runs entirely in the browser — no build tools or dependencies required.

Clone the repository:

```
git clone https://github.com/ybing7412-coder/TrafficSimulator.git
```

## Usage

ES modules require the page to be served over HTTP (opening `index.html` directly will
not work). Two options:

**VS Code (recommended):** install the *Live Server* extension and click **Go Live**.

**Python:** from the repository root, run the included server script:

```
python serve.py
```

then open the printed `http://localhost` address in your browser.

Or simply use the **[live demo](https://ybing7412-coder.github.io/TrafficSimulator/)** with
no setup needed.

## Project Structure

```
TrafficSimulator/
├── index.html          # Entry page
├── serve.py            # Local development server
├── src/                # Modular source (core, models, geometry, analysis, render, ui)
├── sims/               # Individual simulation configurations
└── Demos/              # Demonstration scenarios
```

## Parameters

| Parameter | Symbol | Default | Description |
|-----------|--------|---------|-------------|
| Free-flow speed | Vmax | 30 m/s | Maximum vehicle speed |
| Relaxation rate | α | 0.8 s⁻¹ | OVM response sensitivity |
| Sharpness | m | 0.2 m⁻¹ | Velocity transition steepness |
| Reference spacing | b_f | 18 m | OVM reference gap |
| Vehicle length | ℓ | 4 m | — |
| ARZ relaxation time | τ | 2 s | Macro relaxation toward equilibrium |
| KDE bandwidth | h | 20 m | Density smoothing scale |
| Road length (one lane) | Lx | 2500 m | Circumference |
| Spatial cells count | Nₓ | 200–500 | Macro grid resolution |
| CFL number | — | 0.4 | Numerical stability factor |
Simulation Time Tmax
Jam density rhomax

## References

[1] M. Bando, K. Hasebe, A. Nakayama, A. Shibata, and Y. Sugiyama. Dynamical model of
traffic congestion and numerical simulation. *Phys. Rev. E* 51, 1035–1042 (1995).

[2] A. Aw and M. Rascle. Resurrection of "second order" models of traffic flow.
*SIAM J. Appl. Math.* 60(3), 916–938 (2000).

[3] H. M. Zhang. A non-equilibrium traffic model devoid of gas-like behavior.
*Transportation Research Part B* 36(3), 275–290 (2002).

[4] M. J. Lighthill and G. B. Whitham. On kinematic waves II: A theory of traffic flow
on long crowded roads. *Proc. Royal Society A* 229, 317–345 (1955).

[5] P. I. Richards. Shock waves on the highway. *Operations Research* 4(1), 42–51 (1956).

[6] A. Kesting, M. Treiber, and D. Helbing. General lane-changing model MOBIL for
car-following models. *Transportation Research Record* 1999, 86–94 (2007).

[7] P. Kachroo and S. Sastry. *Travel Time Dynamics for Intelligent Transportation
Systems: Theory and Applications.* Springer (2018).

[8] M. Treiber and A. Kesting. *Traffic Flow Dynamics: Data, Models and Simulation.*
Springer (2013).

## License

MIT © Yiming Bing 2026
