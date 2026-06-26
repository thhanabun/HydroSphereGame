# HydroStrategist

[![Validate HydroStrategist](https://github.com/thhanabun/HydroSphereGame/actions/workflows/ci.yml/badge.svg)](https://github.com/thhanabun/HydroSphereGame/actions/workflows/ci.yml)
[![Deploy HydroStrategist](https://github.com/thhanabun/HydroSphereGame/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/thhanabun/HydroSphereGame/actions/workflows/deploy-pages.yml)

HydroStrategist is a browser-based water resource management strategy game. Plan infrastructure on a hexagonal river basin, commit each turn, and balance stored water, hydropower, irrigation, income, flood risk, and ecosystem sustainability.

**Play:** [thhanabun.github.io/HydroSphereGame](https://thhanabun.github.io/HydroSphereGame/)

## Game Modes

- **Campaign:** Seven objective-driven scenarios with fixed weather scripts and turn limits. The campaign progresses from a first reservoir to twin tributaries and a large river basin.
- **Sandbox:** An open-ended basin with seasonal Markov-chain weather for experimenting with infrastructure and hydrology.

## How To Play

1. Select **How to play?** from the menu when you want a labeled map of the interface.
2. Select Sandbox or a campaign level.
3. During the Planning Phase, drag a construction model from the bottom toolbar onto a valid hex.
4. Queue any additional construction that your credits, engineers, and machinery allow.
5. Read the compact turn panel above the map, then select **Commit Turn** to resolve construction, weather, water flow, income, and objectives.
6. Meet every campaign objective before the turn limit expires.

Only **Commit Turn** advances and resolves a turn. Campaign weather is fixed per turn, while Sandbox weather follows seasonal patterns.

## Map And Planning UX

- Hover a hex to inspect terrain type, water depth, elevation, structure state, and placement feedback.
- Drag a construction model to preview placement. Valid tiles tint green; blocked tiles and silhouettes tint red.
- Use the mouse wheel or the `+` and `-` map buttons to zoom.
- Use middle mouse drag or right mouse drag to pan larger Sandbox maps.
- Use **Fit** to recenter the basin after panning or zooming.
- Open **Turn detail** in the top planning panel when you need the full queued-build and under-construction breakdown.

## Construction

| Structure | Cost | Build Time | Placement | Purpose |
| --- | ---: | ---: | --- | --- |
| Base Dam | 220 cr | 2 turns | Water or Shore | Creates a reservoir and retains water until its spillway threshold is reached. |
| Elevation Dam | 160 cr | 1 turn | Existing dam | Raises an existing dam to increase storage and retention. |
| Conduit | 140 cr | 1 turn | Land or Shore | Diverts water toward irrigation zones or downstream infrastructure. |
| Powerhouse | 260 cr | 3 turns | Land or Shore | Converts available water flow into hydropower and income. |

Construction takes multiple turns and locks excavators or mixers on the construction wheel until the job is complete. The bottom Build palette shows side-view construction models, costs, and build times.

## Rendering Fallback

The primary map uses Three.js/WebGL. If a browser cannot create a WebGL context, HydroStrategist automatically switches to a playable Canvas 2D fallback. You can force the fallback for testing with:

```text
https://thhanabun.github.io/HydroSphereGame/?renderer=canvas
```

## Technology

- TypeScript and Vite
- Three.js rendering and raycasting
- bitECS data-oriented simulation
- XState v5 turn and phase control
- Honeycomb Grid hex coordinates
- GitHub Actions CI/CD
- GitHub Pages hosting

The logical simulation is kept separate from DOM and Three.js rendering. Hydrology, infiltration, weather, construction, resources, and campaign evaluation live in pure TypeScript systems.

## Local Development

Requirements: Node.js 20 or newer and npm.

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/`.

Useful commands:

```bash
npm run typecheck       # TypeScript validation
npm run balance:audit   # Verify that all campaign levels are winnable
npm run build           # Production build
npm run validate        # Run all CI checks
npm run preview         # Preview the production build
```

## CI/CD

The validation workflow runs on every push and pull request:

1. Install dependencies with `npm ci`.
2. Run TypeScript checks.
3. Audit the balance and winning path of all seven campaign levels.
4. Build the production bundle.

Pushes to `main` also run the deployment workflow. GitHub Pages receives a new artifact only after every build check passes, so a failed build does not replace the last successful deployment.

For the first deployment, set **Settings > Pages > Build and deployment > Source** to **GitHub Actions**.

## Project Structure

```text
src/
  core/
    commands/       Build command queue
    ecs/            Components and hydrology systems
    state/          XState game flow
    levels.ts       Campaign maps, weather, and objectives
  view/
    renderer.ts     Three.js basin and construction models
    uishell.ts      HUD and interaction layer
  main.ts           Application coordination
scripts/
  balance-audit.ts  Campaign solvability audit
.github/workflows/  CI and GitHub Pages deployment
```

## Status

HydroStrategist is a playable prototype with seven audited campaign levels, a How to play guide, Sandbox expansion, construction delays, map zoom/pan/fit, placement validation, WebGL fallback rendering, and automated GitHub Pages deployment. Campaign balance, simulation depth, visual clarity, and onboarding remain active areas of development.
