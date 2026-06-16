# HydroStrategist Run Guide

HydroStrategist is a Vite TypeScript prototype with a core hydrology simulation layer and a Three.js viewport:

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
npm install
```

## Run In Development

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

The prototype starts with a small seven-cell basin.

Mode select:

- `Sandbox Mode`: open-ended basin editing and simulation.
- `Campaign Levels`: five objective-based scenarios with turn limits.

Basic play loop:

1. Pick Sandbox or a campaign level from the menu.
2. In `Build` mode, click a hex during `Planning Phase`.
3. Choose `Base Dam`, `Elevation Dam`, `Conduit`, or `Powerhouse`.
4. Toggle `Add Tile Mode` to click an existing hex and add a neighboring grid tile when the level allows it.
5. Click `Commit Plan` to execute queued build commands and run hydrology.
6. At round end, the construction wheel rotates, income/penalties resolve, and objectives update.

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
    "preview": "node scripts/preview.mjs",
    "validate": "npm run typecheck && npm run build",
    "typecheck": "tsc --noEmit"
  }
}
```

## Current Status

The current game is a runnable strategy prototype with infrastructure placement, player resources, construction wheel delays, XState planning/simulation phases, and dam-aware shallow-water physics.
