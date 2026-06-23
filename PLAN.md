# HydroStrategist Master Plan

This plan follows `AGENTS.md` as the source of truth.

## Milestone 1: Data Structuring & ECS Setup

- `StructureComponent` tracks infrastructure type, level, dam height, discharge capacity, and water capacity.
- `PlayerResourceComponent` is initialized as a singleton entity for credits, engineers, excavators, and concrete mixers.
- `ConstructionWheelComponent` stores six sector slots as bitECS scalar fields.

Status: complete.

## Milestone 2: Hydrological Physics Expansion

- `ShallowWaterSystem` computes total head as `terrain elevation + water depth + dam height`.
- Dam cells block outbound flow until water depth exceeds their reservoir/spillway threshold.
- Spillway discharge is capped by `StructureComponent.dischargeCapacity`.

Status: complete.

## Milestone 3: Worker Placement & Construction Wheel

- `buildCommands.ts` implements command-pattern infrastructure placement.
- Commands check resources, deduct credits/machinery, lock machinery into the construction wheel, and write ECS structure data.
- `constructionWheelSystem.ts` rotates the wheel one sector per round and returns locked machinery.

Status: complete.

## Milestone 4: Interactive View & Verification

- `renderer.ts` uses Three.js raycasting and Honeycomb hex coordinates for tile interaction.
- `uishell.ts` owns the HTML/CSS overlay and HUD wiring.
- `main.ts` coordinates XState planning, command execution, simulation, and evaluation phases.
- The map supports hover tooltips, valid/invalid placement tinting, drag-and-drop construction, zoom, pan, fit, and Canvas fallback rendering when WebGL is unavailable.
- The top planning panel keeps commit controls, phase status, queue count, player messages, and collapsible turn details close to the map.

Status: complete for the playable prototype; deeper polish and onboarding remain iterative.

## Validation

Run:

```bash
npm run validate
```

Expected result: TypeScript typecheck, campaign balance audit, and Vite production build all pass.

## Deployment

- Pushes to `main` run validation and deploy the current production build to GitHub Pages.
- A failed validation or build does not replace the last successful Pages deployment.
- Live site: <https://thhanabun.github.io/HydroSphereGame/>
