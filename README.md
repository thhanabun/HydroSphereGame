# HydroStrategist

[![Validate HydroStrategist](https://github.com/thhanabun/HydroSphereGame/actions/workflows/ci.yml/badge.svg)](https://github.com/thhanabun/HydroSphereGame/actions/workflows/ci.yml)
[![Deploy HydroStrategist](https://github.com/thhanabun/HydroSphereGame/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/thhanabun/HydroSphereGame/actions/workflows/deploy-pages.yml)

HydroStrategist is a browser-based water resource management strategy game. Plan infrastructure on a hexagonal river basin, commit each turn, and balance stored water, hydropower, irrigation, income, flood risk, and ecosystem sustainability.

**Play:** [thhanabun.github.io/HydroSphereGame](https://thhanabun.github.io/HydroSphereGame/)

## Game Modes

- **Campaign:** Seven objective-driven scenarios with fixed weather scripts and turn limits. The campaign progresses from a first reservoir to twin tributaries and a large river basin.
- **Sandbox:** An open-ended basin with seasonal Markov-chain weather for experimenting with infrastructure and hydrology.

## How To Play

1. Select Sandbox or a campaign level.
2. During the Planning Phase, drag a construction model from the bottom toolbar onto a valid hex.
3. Queue any additional construction that your credits, engineers, and machinery allow.
4. Select **Commit Plan** to resolve construction, weather, water flow, income, and objectives.
5. Meet every campaign objective before the turn limit expires.

Only **Commit Plan** advances and resolves a turn. Campaign weather is fixed per turn, while Sandbox weather follows seasonal patterns.

## Construction

| Structure | Purpose |
| --- | --- |
| Base Dam | Creates a reservoir and retains water until its spillway threshold is reached. |
| Elevation Dam | Raises an existing dam to increase storage and retention. |
| Conduit | Diverts water toward irrigation zones or downstream infrastructure. |
| Powerhouse | Converts available water flow into hydropower and income. |

Construction takes multiple turns and locks excavators or mixers on the construction wheel until the job is complete. The in-game hint panel shows placement rules, costs, build time, and resource effects.

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

HydroStrategist is a playable prototype. Campaign balance, simulation behavior, construction feedback, visual clarity, and deployment automation remain active areas of development.
