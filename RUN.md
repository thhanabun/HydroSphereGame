# HydroStrategist Run Guide

HydroStrategist is a Vite TypeScript prototype with a core hydrology simulation layer, a Three.js viewport, and a Canvas fallback for browsers that cannot create a WebGL context:

```text
src/
  main.ts
  style.css
  core/
    types.ts
    ecs/
      components.ts
      systems.ts
    state/
      gameFSM.ts
  view/
    renderer.ts
    uishell.ts
```

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Install Dependencies

From the project root:

```bash
npm ci
```

## Run In Development

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

The prototype starts from the mode menu. Campaign levels use authored maps and fixed weather scripts; Sandbox uses seasonal weather patterns and allows open-ended experimentation.

Mode select:

- `Sandbox Mode`: open-ended basin editing and simulation.
- `Campaign Levels`: seven objective-based scenarios with turn limits.

Basic play loop:

1. Pick Sandbox or a campaign level from the menu.
2. In `Planning Phase`, drag `Base Dam`, `Elevation`, `Conduit`, or `Powerhouse` from the bottom Build palette onto a valid hex.
3. Use hover tooltips and green/red placement highlights to verify valid placement before dropping.
4. Toggle `Add Tile Mode` and drag from an existing hex to expand the grid when the level allows it.
5. Read the compact top turn panel, then click `Commit Turn` to execute queued build commands and run hydrology.
6. At round end, the construction wheel rotates, income/penalties resolve, objectives update, and planning reopens.

Map controls:

- Mouse wheel or `+`/`-`: zoom the basin.
- Middle mouse drag or right mouse drag: pan the map.
- `Fit`: recenter and fit the basin.
- `Turn detail`: expand the top turn panel to inspect queued builds, plan cost, and active construction.

Weather is resolved once per turn, then held constant during that turn's simulation. Use **Storm Pulse** to force heavy weather on the next turn and **Reset Basin** to restore initial water/resources.

Resources matter:

- Dams store reservoir water.
- Powerhouses convert available flow into credits.
- Moderate water depths produce irrigation income.
- Flooding and drought create credit penalties.
- Credits are spent on infrastructure and new grid surveys.

## Build For Production

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Expected Scripts

```json
{
  "scripts": {
    "dev": "node scripts/dev-server.mjs",
    "dev:server": "node scripts/dev-server.mjs",
    "build": "tsc --noEmit && node scripts/build.mjs",
    "balance:audit": "node scripts/run-balance-audit.mjs",
    "preview": "node scripts/preview.mjs",
    "validate": "npm run typecheck && npm run balance:audit && npm run build",
    "typecheck": "tsc --noEmit"
  }
}
```

## Current Status

The current game is a runnable strategy prototype with infrastructure placement, player resources, construction wheel delays, XState planning/simulation phases, dam-aware shallow-water physics, audited campaign balance, GitHub Actions CI, and GitHub Pages deployment.
