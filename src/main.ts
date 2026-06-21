import { addComponent, addEntity, createWorld } from 'bitecs';
import { createActor } from 'xstate';

import {
  ConstructionWheelComponent,
  Infiltration,
  PlayerResourceComponent,
  Position,
  Structure,
  StructureKind,
  SurfaceKind,
  type SurfaceKindCode,
  Terrain,
  Water,
  WaterSource,
} from './core/ecs/components';
import {
  ShallowWaterSystem,
  SoilInfiltrationSystem,
  ResourceEconomySystem,
  WeatherSystem,
  SeasonalWaterSourceSystem,
  ConstructionProgressSystem,
  type HexGridTopology,
  type ShallowWaterSystemStats,
} from './core/ecs/systems';
import { ConstructionWheelSystem } from './core/ecs/systems/constructionWheelSystem';
import {
  INFRASTRUCTURE_COSTS,
  createBuildCommand,
  type InfrastructureBuildType,
} from './core/commands/buildCommands';
import {
  hydroStrategistGameMachine,
  type BuildCommandRequest,
} from './core/state/gameFSM';
import {
  CAMPAIGN_LEVELS,
  SANDBOX_LEVEL,
  type BasinCellSeed,
  type LevelDefinition,
} from './core/levels';
import type { Season, SimulationConstants, WeatherState } from './core/types';
import './style.css';
import { HydroRenderer, type BasinRenderCell } from './view/renderer';
import {
  UIShell,
  type BuildMenuSnapshot,
  type ConstructionHudItem,
  type PendingBuildHudItem,
  type ResourceHudSnapshot,
} from './view/uishell';

type MutableHexGridTopology = HexGridTopology;

const HEX_DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

const SIMULATION_CONSTANTS: SimulationConstants = {
  gravityMetersPerSecondSquared: 9.80665,
  cellWidthMeters: 30,
  cellHeightMeters: 30,
  pipeCrossSectionAreaMetersSquared: 18,
  pipeLengthMeters: 30,
  timeStepSeconds: 0.35,
  infiltrationEtaMeters: 0.0001,
};

const GRID_EXPANSION_COST = 60;
const MAX_RENDER_CELLS = 96;
const WEATHER_EVENT_DURATION_SECONDS = 21600;
const BUILD_LABELS: Readonly<Record<InfrastructureBuildType, string>> = {
  baseDam: 'Base Dam',
  elevationDam: 'Elevation Dam',
  conduit: 'Conduit',
  powerhouse: 'Powerhouse',
};
const SANDBOX_SEASON_PATTERN: readonly Season[] = [
  'dry',
  'dry',
  'dry',
  'monsoon',
  'monsoon',
  'monsoon',
  'monsoon',
  'dry',
];

const STRUCTURE_KIND_LABELS: Readonly<Record<number, string>> = {
  [StructureKind.none]: 'None',
  [StructureKind.baseDam]: 'Base Dam',
  [StructureKind.elevationDam]: 'Elevation Dam',
  [StructureKind.conduit]: 'Conduit',
  [StructureKind.powerhouse]: 'Powerhouse',
};

const SURFACE_KIND_LABELS: Readonly<Record<number, string>> = {
  [SurfaceKind.land]: 'Land Build Tile',
  [SurfaceKind.shore]: 'Shore Build Tile',
  [SurfaceKind.water]: 'Water Depth Tile',
};

const EMPTY_RESOURCE_COST: ResourceHudSnapshot = {
  credits: 0,
  reservoirWaterCubicMeters: 0,
  lastNetIncomeCredits: 0,
  engineers: 0,
  excavators: 0,
  concreteMixers: 0,
};

const world = createWorld();
const renderCells: BasinRenderCell[] = [];
const eidByCoord = new Map<string, number>();
const cellSeedByEid = new Map<number, BasinCellSeed>();
const gameActor = createActor(hydroStrategistGameMachine, {
  input: {
    simulationTicksPerTurn: 96,
    maxWorkerActionsPerTurn: 6,
  },
});
let currentWeather: WeatherState = 'sunny';
let forceStormNextTurn = false;
let latestStats: ShallowWaterSystemStats = {
  totalWaterDepthMeters: 0,
  maxWaterDepthMeters: 0,
  maxFlowCubicMetersPerSecond: 0,
};
let latestObjectiveProgress = {
  turn: 0,
  credits: SANDBOX_LEVEL.resources.credits,
  reservoirWaterCubicMeters: 0,
  hydropowerScore: 0,
  irrigationScore: 0,
  sustainabilityScore: 100,
  cumulativeNetIncomeCredits: 0,
  builtBaseDams: 0,
  builtElevationDamLevels: 0,
  builtConduits: 0,
  builtPowerhouses: 0,
};
let currentLevel: LevelDefinition = SANDBOX_LEVEL;
let campaignOutcome: 'playing' | 'complete' | 'failed' = 'playing';
let selectedCell: BasinRenderCell | undefined;
let interactionMode: 'build' | 'addTile' = 'build';
let draggedBuildType: InfrastructureBuildType | undefined;
let builtBaseDams = 0;
let builtElevationDamLevels = 0;
let builtConduits = 0;
let builtPowerhouses = 0;
let cumulativeNetIncomeCredits = 0;

const coordKey = (q: number, r: number): string => `${q},${r}`;

const getNextCampaignLevel = (): LevelDefinition | undefined => {
  const currentIndex = CAMPAIGN_LEVELS.findIndex(
    (level) => level.id === currentLevel.id,
  );

  if (currentIndex < 0) {
    return undefined;
  }

  return CAMPAIGN_LEVELS[currentIndex + 1];
};

const getCampaignEndedMessage = (): string =>
  campaignOutcome === 'complete'
    ? 'This campaign level is complete. Choose Next Level or Menu.'
    : 'This campaign level has ended. Retry or choose Menu.';

const getSandboxSeasonForTurn = (turn: number): Season =>
  SANDBOX_SEASON_PATTERN[(Math.max(1, turn) - 1) % SANDBOX_SEASON_PATTERN.length] ??
  'dry';

const getFixedCampaignWeatherForTurn = (
  level: LevelDefinition,
  turn: number,
): WeatherState | undefined => {
  if (level.id === SANDBOX_LEVEL.id || !level.weatherScript) {
    return undefined;
  }

  return (
    level.weatherScript[Math.min(level.weatherScript.length - 1, Math.max(1, turn) - 1)] ??
    level.weatherScript[level.weatherScript.length - 1]
  );
};

const formatWeatherScript = (weatherScript: readonly WeatherState[]): string =>
  weatherScript
    .map((weather, index) => `T${index + 1} ${weather}`)
    .join(', ');

const formatBuildCost = (buildType: InfrastructureBuildType): string => {
  const cost = INFRASTRUCTURE_COSTS[buildType];

  return `${cost.credits} cr, ${cost.engineers} eng, ${cost.excavators} exc, ${cost.concreteMixers} mix, ${cost.buildTurns} turn(s)`;
};

const inferSurfaceType = (seed: BasinCellSeed): SurfaceKindCode => {
  if (seed.surfaceType !== undefined) {
    return seed.surfaceType;
  }

  if ((seed.sourceDepthPerTurn ?? 0) > 0 || seed.waterDepth >= 0.22) {
    return SurfaceKind.water;
  }

  if (seed.waterDepth >= 0.06 || seed.elevation <= 0.35) {
    return SurfaceKind.shore;
  }

  return SurfaceKind.land;
};

const getSurfaceLabel = (eid: number): string =>
  SURFACE_KIND_LABELS[Terrain.surfaceType[eid]] ?? 'Land Build Tile';

const validateBuildSurface = (
  targetCellEid: number,
  buildType: InfrastructureBuildType,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } => {
  const surfaceType = Terrain.surfaceType[targetCellEid];

  if (buildType === 'baseDam') {
    return surfaceType === SurfaceKind.water || surfaceType === SurfaceKind.shore
      ? { ok: true }
      : {
          ok: false,
          reason: 'Base Dam needs a Water Depth or Shore tile.',
        };
  }

  if (buildType === 'powerhouse') {
    return surfaceType === SurfaceKind.land || surfaceType === SurfaceKind.shore
      ? { ok: true }
      : {
          ok: false,
          reason: 'Powerhouse needs a Land or Shore build tile.',
        };
  }

  if (buildType === 'conduit') {
    return surfaceType === SurfaceKind.land || surfaceType === SurfaceKind.shore
      ? { ok: true }
      : {
          ok: false,
          reason: 'Conduit needs a Land or Shore build tile.',
        };
  }

  return { ok: true };
};

const getStructureLabel = (eid: number): string => {
  const pendingType = Number(Structure.pendingType[eid]);

  if (
    pendingType !== StructureKind.none &&
    Structure.constructionTurnsRemaining[eid] > 0
  ) {
    return `${STRUCTURE_KIND_LABELS[pendingType] ?? 'Structure'} building (${Structure.constructionTurnsRemaining[eid]} turn(s))`;
  }

  const structureType = Number(Structure.type[eid]);

  if (structureType === StructureKind.baseDam) {
    return `Base Dam L${Math.max(1, Structure.level[eid])}`;
  }

  if (structureType === StructureKind.elevationDam) {
    return `Elevated Dam L${Math.max(1, Structure.level[eid])}`;
  }

  if (structureType === StructureKind.conduit) {
    return 'Conduit';
  }

  if (structureType === StructureKind.powerhouse) {
    return 'Powerhouse';
  }

  return 'Empty';
};

const getPendingBuildCost = (
  commands: readonly BuildCommandRequest[],
): ResourceHudSnapshot => {
  const total = { ...EMPTY_RESOURCE_COST };

  for (const command of commands) {
    const cost = INFRASTRUCTURE_COSTS[command.buildType];

    total.credits += cost.credits;
    total.engineers += cost.engineers;
    total.excavators += cost.excavators;
    total.concreteMixers += cost.concreteMixers;
  }

  return total;
};

const getPendingBuildHudItems = (
  commands: readonly BuildCommandRequest[],
): PendingBuildHudItem[] =>
  commands.map((command) => {
    const cell = renderCells.find((candidate) => candidate.eid === command.targetCellEid);
    const targetLabel = cell ? `q${cell.q}, r${cell.r}` : `cell ${command.targetCellEid}`;

    return {
      id: command.id,
      label: BUILD_LABELS[command.buildType],
      targetLabel,
      costLabel: formatBuildCost(command.buildType),
    };
  });

const getActiveConstructionHudItems = (): ConstructionHudItem[] =>
  renderCells
    .filter((cell) => Structure.constructionTurnsRemaining[cell.eid] > 0)
    .map((cell) => {
      const totalTurns = Math.max(1, Structure.constructionTotalTurns[cell.eid]);
      const turnsRemaining = Structure.constructionTurnsRemaining[cell.eid];
      const pendingType = Number(Structure.pendingType[cell.eid]);
      const progressPercent = Math.round(
        ((totalTurns - turnsRemaining) / totalTurns) * 100,
      );

      return {
        label: STRUCTURE_KIND_LABELS[pendingType] ?? 'Structure',
        targetLabel: `q${cell.q}, r${cell.r}`,
        turnsRemaining,
        progressPercent,
      };
    });

const getAvailableResourcesAfterPending = (): ResourceHudSnapshot => {
  const pendingCost = getPendingBuildCost(
    gameActor.getSnapshot().context.pendingBuildCommands,
  );

  return {
    credits: PlayerResourceComponent.credits[playerResourceEid] - pendingCost.credits,
    reservoirWaterCubicMeters:
      PlayerResourceComponent.reservoirWater[playerResourceEid],
    lastNetIncomeCredits:
      PlayerResourceComponent.lastNetIncome[playerResourceEid],
    engineers:
      PlayerResourceComponent.engineers[playerResourceEid] - pendingCost.engineers,
    excavators:
      PlayerResourceComponent.excavators[playerResourceEid] - pendingCost.excavators,
    concreteMixers:
      PlayerResourceComponent.concreteMixers[playerResourceEid] -
      pendingCost.concreteMixers,
  };
};

const validateBuildRequest = (
  targetCellEid: number,
  buildType: InfrastructureBuildType,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } => {
  const snapshot = gameActor.getSnapshot();

  if (snapshot.value !== 'planningPhase') {
    return {
      ok: false,
      reason: 'Build orders are only available during Planning.',
    };
  }

  if (Terrain.active[targetCellEid] !== 1) {
    return {
      ok: false,
      reason: 'This cell is not part of the active basin.',
    };
  }

  if (
    snapshot.context.pendingBuildCommands.length >=
    snapshot.context.maxWorkerActionsPerTurn
  ) {
    return {
      ok: false,
      reason: `Turn action limit reached (${snapshot.context.maxWorkerActionsPerTurn}).`,
    };
  }

  if (
    snapshot.context.pendingBuildCommands.some(
      (command) => command.targetCellEid === targetCellEid,
    )
  ) {
    return {
      ok: false,
      reason: 'This cell already has a queued build order.',
    };
  }

  if (Structure.constructionTurnsRemaining[targetCellEid] > 0) {
    return {
      ok: false,
      reason: 'This cell already has construction in progress.',
    };
  }

  const structureType = Number(Structure.type[targetCellEid]);
  const cellHasDam =
    structureType === StructureKind.baseDam ||
    structureType === StructureKind.elevationDam;

  if (buildType === 'elevationDam' && !cellHasDam) {
    return {
      ok: false,
      reason: 'Elevation requires an existing dam.',
    };
  }

  if (buildType !== 'elevationDam' && structureType !== StructureKind.none) {
    return {
      ok: false,
      reason: 'This cell already contains infrastructure.',
    };
  }

  if (buildType !== 'elevationDam') {
    const surfaceValidation = validateBuildSurface(targetCellEid, buildType);

    if (!surfaceValidation.ok) {
      return surfaceValidation;
    }
  }

  const cost = INFRASTRUCTURE_COSTS[buildType];
  const available = getAvailableResourcesAfterPending();

  if (available.credits < cost.credits) {
    return {
      ok: false,
      reason: `Need ${cost.credits - available.credits} more credits.`,
    };
  }

  if (available.engineers < cost.engineers) {
    return {
      ok: false,
      reason: `Need ${cost.engineers - available.engineers} more engineer(s).`,
    };
  }

  if (available.excavators < cost.excavators) {
    return {
      ok: false,
      reason: `Need ${cost.excavators - available.excavators} more excavator(s).`,
    };
  }

  if (available.concreteMixers < cost.concreteMixers) {
    return {
      ok: false,
      reason: `Need ${cost.concreteMixers - available.concreteMixers} more mixer(s).`,
    };
  }

  return { ok: true };
};

const createBuildMenuSnapshot = (cell: BasinRenderCell): BuildMenuSnapshot => {
  const createOption = (buildType: InfrastructureBuildType) => {
    const validation = validateBuildRequest(cell.eid, buildType);

    return {
      buildType,
      label: BUILD_LABELS[buildType],
      costLabel: formatBuildCost(buildType),
      disabled: !validation.ok,
      reason: validation.ok ? undefined : validation.reason,
    };
  };

  return {
    q: cell.q,
    r: cell.r,
    elevationMeters: Terrain.elevation[cell.eid],
    waterDepthMeters: Water.depth[cell.eid],
    surfaceLabel: getSurfaceLabel(cell.eid),
    structureLabel:
      WaterSource.active[cell.eid] === 1
        ? `${getStructureLabel(cell.eid)} | Headwater +${WaterSource.baseDepthPerTurn[
            cell.eid
          ].toFixed(2)} m/turn`
        : getStructureLabel(cell.eid),
    options: {
      baseDam: createOption('baseDam'),
      elevationDam: createOption('elevationDam'),
      conduit: createOption('conduit'),
      powerhouse: createOption('powerhouse'),
    },
  };
};

const getTurnResolutionHud = (
  phase: unknown,
  simulationTickIndex: number,
  simulationTicksPerTurn: number,
): Pick<
  Parameters<UIShell['updateHud']>[0],
  | 'interactionLocked'
  | 'turnResolutionProgress'
  | 'turnResolutionLabel'
  | 'turnResolutionDetail'
> => {
  const phaseName = String(phase);

  if (phaseName === 'weatherPhase') {
    return {
      interactionLocked: true,
      turnResolutionProgress: 0.08,
      turnResolutionLabel: 'Resolving Weather',
      turnResolutionDetail: 'Rolling the seasonal Markov weather model.',
    };
  }

  if (phaseName === 'commandExecutionPhase') {
    return {
      interactionLocked: true,
      turnResolutionProgress: 0.16,
      turnResolutionLabel: 'Executing Orders',
      turnResolutionDetail: 'Committing queued infrastructure to the basin.',
    };
  }

  if (phaseName === 'simulationPhase') {
    const progress =
      simulationTicksPerTurn <= 0
        ? 1
        : Math.min(1, simulationTickIndex / simulationTicksPerTurn);

    return {
      interactionLocked: true,
      turnResolutionProgress: 0.18 + progress * 0.72,
      turnResolutionLabel: 'Solving Basin',
      turnResolutionDetail: `Physics tick ${Math.min(
        simulationTickIndex,
        simulationTicksPerTurn,
      )}/${simulationTicksPerTurn}`,
    };
  }

  if (phaseName === 'evaluationPhase') {
    return {
      interactionLocked: true,
      turnResolutionProgress: 0.94,
      turnResolutionLabel: 'Evaluating Basin',
      turnResolutionDetail: 'Scoring water storage, income, and ecosystem pressure.',
    };
  }

  return {
    interactionLocked: false,
    turnResolutionProgress: 0,
    turnResolutionLabel: 'Planning',
    turnResolutionDetail: 'Planning is open.',
  };
};

const playerResourceEid = addEntity(world);
addComponent(world, PlayerResourceComponent, playerResourceEid);
PlayerResourceComponent.credits[playerResourceEid] = SANDBOX_LEVEL.resources.credits;
PlayerResourceComponent.engineers[playerResourceEid] = SANDBOX_LEVEL.resources.engineers;
PlayerResourceComponent.excavators[playerResourceEid] = SANDBOX_LEVEL.resources.excavators;
PlayerResourceComponent.concreteMixers[playerResourceEid] =
  SANDBOX_LEVEL.resources.concreteMixers;
PlayerResourceComponent.reservoirWater[playerResourceEid] = 0;
PlayerResourceComponent.lastGrossIncome[playerResourceEid] = 0;
PlayerResourceComponent.lastPenalty[playerResourceEid] = 0;
PlayerResourceComponent.lastNetIncome[playerResourceEid] = 0;

const constructionWheelEid = addEntity(world);
addComponent(world, ConstructionWheelComponent, constructionWheelEid);
ConstructionWheelComponent.activeSlot[constructionWheelEid] = 0;

const createBasinCell = (seed: BasinCellSeed): BasinRenderCell => {
    const eid = addEntity(world);
    const s = -seed.q - seed.r;

    addComponent(world, Position, eid);
    addComponent(world, Terrain, eid);
    addComponent(world, Water, eid);
    addComponent(world, WaterSource, eid);
    addComponent(world, Infiltration, eid);
    addComponent(world, Structure, eid);

    Position.q[eid] = seed.q;
    Position.r[eid] = seed.r;
    Position.s[eid] = s;
    Position.worldX[eid] = Math.sqrt(3) * (seed.q + seed.r / 2);
    Position.worldY[eid] = seed.elevation;
    Position.worldZ[eid] = 1.5 * seed.r;

    Terrain.elevation[eid] = seed.elevation;
    Terrain.cellWidth[eid] = SIMULATION_CONSTANTS.cellWidthMeters;
    Terrain.cellHeight[eid] = SIMULATION_CONSTANTS.cellHeightMeters;
    Terrain.roughness[eid] = 0.04;
    Terrain.curveNumber[eid] = seed.curveNumber;
    Terrain.soilType[eid] = 3;
    Terrain.biomeType[eid] = 1;
    Terrain.surfaceType[eid] = inferSurfaceType(seed);
    Terrain.active[eid] = 1;

    Water.depth[eid] = seed.waterDepth;
    Water.previousDepth[eid] = seed.waterDepth;
    Water.hydraulicHead[eid] = seed.elevation + seed.waterDepth + seed.damHeight;

    WaterSource.active[eid] =
      seed.sourceDepthPerTurn && seed.sourceDepthPerTurn > 0 ? 1 : 0;
    WaterSource.baseDepthPerTurn[eid] = seed.sourceDepthPerTurn ?? 0;
    WaterSource.lastDepthAdded[eid] = 0;

    Infiltration.saturatedHydraulicConductivity[eid] = 0.000006;
    Infiltration.wettingFrontSuctionHead[eid] = 0.18;
    Infiltration.soilMoistureDeficit[eid] = 0.32;
    Infiltration.cumulativeDepth[eid] = 0.001;

    Structure.type[eid] = seed.structureType;
    Structure.level[eid] = seed.structureType === StructureKind.none ? 0 : 1;
    Structure.active[eid] = seed.structureType === StructureKind.none ? 0 : 1;
    Structure.pendingType[eid] = StructureKind.none;
    Structure.dischargeCapacity[eid] =
      seed.structureType === StructureKind.baseDam ? 0.22 : 0.3;
    Structure.damHeight[eid] = seed.damHeight;
    Structure.maxWaterDepth[eid] = seed.maxWaterDepth;
    Structure.capacity[eid] = seed.maxWaterDepth;
    Structure.storageDepth[eid] = 0;
    Structure.constructionProgress[eid] = 1;
    Structure.constructionTurnsRemaining[eid] = 0;
    Structure.constructionTotalTurns[eid] = 0;
    Structure.pendingDischargeCapacity[eid] = 0;
    Structure.pendingDamHeight[eid] = 0;
    Structure.pendingMaxWaterDepth[eid] = 0;
    Structure.pendingEfficiency[eid] = 0;
    Structure.pendingGateOpening[eid] = 0;
    Structure.efficiency[eid] =
      seed.structureType === StructureKind.powerhouse ? 0.78 : 0;
    Structure.gateOpening[eid] =
      seed.structureType === StructureKind.powerhouse ? 1 : 0.25;
    Structure.conduitTarget[eid] = -1;

    const renderCell = { eid, q: seed.q, r: seed.r };

    renderCells.push(renderCell);
    eidByCoord.set(coordKey(seed.q, seed.r), eid);
    cellSeedByEid.set(eid, seed);

    return renderCell;
};

const rebuildTopology = (): MutableHexGridTopology => {
  const maxEid = Math.max(...renderCells.map((cell) => cell.eid));
  const neighborEids = new Int32Array((maxEid + 1) * HEX_DIRECTIONS.length);
  neighborEids.fill(-1);

  for (const cell of renderCells) {
    for (let direction = 0; direction < HEX_DIRECTIONS.length; direction += 1) {
      const [dq, dr] = HEX_DIRECTIONS[direction];
      const neighbor = eidByCoord.get(coordKey(cell.q + dq, cell.r + dr));

      neighborEids[cell.eid * HEX_DIRECTIONS.length + direction] = neighbor ?? -1;
    }
  }

  return {
    neighborEids,
    directionCount: 6,
  };
};

const initializeBasin = (seed: readonly BasinCellSeed[]): MutableHexGridTopology => {
  for (const cell of renderCells) {
    Terrain.active[cell.eid] = 0;
  }

  renderCells.length = 0;
  eidByCoord.clear();
  cellSeedByEid.clear();

  for (const cellSeed of seed) {
    createBasinCell(cellSeed);
  }

  return rebuildTopology();
};

let topology = initializeBasin(SANDBOX_LEVEL.seed);
const uiShell = new UIShell({
  onSandboxSelected: () => loadLevel(SANDBOX_LEVEL),
  onLevelSelected: (levelId) => {
    const level = CAMPAIGN_LEVELS.find((candidate) => candidate.id === levelId);

    if (level) {
      loadLevel(level);
    }
  },
  onBuildSelected: queueBuild,
  onBuildDragStarted: (buildType) => {
    draggedBuildType = buildType;
    uiShell.setMessage(`Drag ${BUILD_LABELS[buildType]} onto a hex to queue it.`);
  },
  onBuildDragEnded: () => {
    draggedBuildType = undefined;
  },
  onCancelBuildCommand: cancelBuildCommand,
  onAddTileDirectionSelected: addTileAdjacentToSelectedCell,
  onToggleAddTileMode: toggleAddTileMode,
  onCommitPlan: commitPlanning,
  onReset: resetBasin,
  onStormPulse: () => {
    if (campaignOutcome !== 'playing' && currentLevel.id !== SANDBOX_LEVEL.id) {
      uiShell.setMessage(getCampaignEndedMessage());
      return;
    }

    if (currentLevel.id !== SANDBOX_LEVEL.id) {
      uiShell.setMessage('Campaign weather is fixed for each turn. Storm Pulse is Sandbox-only.');
      uiShell.addEvent('Storm Pulse ignored: campaign weather is scripted.');
      return;
    }

    forceStormNextTurn = true;
    uiShell.setMessage('Storm pulse primed for the next turn.');
    uiShell.addEvent('Storm pulse queued for the next weather roll.');
  },
  onMenuRequested: () => {
    uiShell.hideOutcome();
    uiShell.showMainMenu();
  },
  onRetryLevel: () => loadLevel(currentLevel),
  onNextLevel: () => {
    const nextLevel = getNextCampaignLevel();

    if (nextLevel) {
      loadLevel(nextLevel);
    } else {
      uiShell.hideOutcome();
      uiShell.showMainMenu();
      uiShell.setMessage('Campaign complete. Choose a level or Sandbox from Menu.');
    }
  },
  onOutcomeMenuRequested: () => {
    uiShell.hideOutcome();
    uiShell.showMainMenu();
  },
});
const hydroRenderer = new HydroRenderer(uiShell.viewport, {
  cells: renderCells,
  tileRadiusMeters: 1,
  maxCells: MAX_RENDER_CELLS,
  onCellDropped: (cell) => {
    if (!draggedBuildType) {
      return;
    }

    if (gameActor.getSnapshot().value !== 'planningPhase') {
      uiShell.setMessage('Construction drops are only available during Planning.');
      draggedBuildType = undefined;
      return;
    }

    selectedCell = cell;
    const buildType = draggedBuildType;

    draggedBuildType = undefined;
    queueBuild(buildType);
  },
  onCellDragged: (cell, direction) => {
    if (gameActor.getSnapshot().value !== 'planningPhase') {
      uiShell.setMessage('Tile drag is only available during Planning.');
      return;
    }

    if (campaignOutcome !== 'playing' && currentLevel.id !== SANDBOX_LEVEL.id) {
      uiShell.setMessage(getCampaignEndedMessage());
      return;
    }

    selectedCell = cell;

    if (!currentLevel.allowGridExpansion) {
      uiShell.setMessage('This level does not allow grid expansion.');
      return;
    }

    if (interactionMode !== 'addTile') {
      uiShell.setMessage('Switch to Add Tile Mode, then drag from a hex to expand.');
      return;
    }

    addTileAdjacentToSelectedCell(direction);
  },
  onCellSelected: (cell, pointer) => {
    if (gameActor.getSnapshot().value !== 'planningPhase') {
      uiShell.setMessage('Build orders are only available during Planning.');
      return;
    }

    if (campaignOutcome !== 'playing' && currentLevel.id !== SANDBOX_LEVEL.id) {
      uiShell.setMessage(getCampaignEndedMessage());
      return;
    }

    selectedCell = cell;
    if (interactionMode === 'addTile') {
      uiShell.showAddTileMenu(cell, pointer);
    } else {
      uiShell.showBuildMenu(createBuildMenuSnapshot(cell), pointer);
    }
  },
});

const updateHud = (stats: ShallowWaterSystemStats = latestStats): void => {
  const snapshot = gameActor.getSnapshot();
  const turnResolutionHud = getTurnResolutionHud(
    snapshot.value,
    snapshot.context.simulationTickIndex,
    snapshot.context.simulationTicksPerTurn,
  );
  const pendingBuildCost = getPendingBuildCost(snapshot.context.pendingBuildCommands);

  hydroRenderer.setWeather(currentWeather);
  uiShell.updateHud({
    weather: currentWeather,
    turn: snapshot.context.turn,
    totalWaterDepthMeters: stats.totalWaterDepthMeters,
    maxWaterDepthMeters: stats.maxWaterDepthMeters,
    maxFlowCubicMetersPerSecond: stats.maxFlowCubicMetersPerSecond,
    phase: snapshot.value,
    mode: interactionMode,
    queuedBuildCount: snapshot.context.pendingBuildCommands.length,
    ...turnResolutionHud,
    pendingBuilds: getPendingBuildHudItems(snapshot.context.pendingBuildCommands),
    pendingBuildCost,
    activeConstructions: getActiveConstructionHudItems(),
    resources: {
      credits: PlayerResourceComponent.credits[playerResourceEid],
      reservoirWaterCubicMeters:
        PlayerResourceComponent.reservoirWater[playerResourceEid],
      lastNetIncomeCredits:
        PlayerResourceComponent.lastNetIncome[playerResourceEid],
      engineers: PlayerResourceComponent.engineers[playerResourceEid],
      excavators: PlayerResourceComponent.excavators[playerResourceEid],
      concreteMixers: PlayerResourceComponent.concreteMixers[playerResourceEid],
    },
    objectives: currentLevel.objectives,
    objectiveProgress: {
      ...latestObjectiveProgress,
      credits: PlayerResourceComponent.credits[playerResourceEid],
      reservoirWaterCubicMeters:
        PlayerResourceComponent.reservoirWater[playerResourceEid],
      cumulativeNetIncomeCredits,
      builtBaseDams,
      builtElevationDamLevels,
      builtConduits,
      builtPowerhouses,
    },
    canUseStormPulse: currentLevel.id === SANDBOX_LEVEL.id,
    canUseAddTileMode: currentLevel.allowGridExpansion,
  });
};

function resetPlayerResources(level: LevelDefinition): void {
  PlayerResourceComponent.credits[playerResourceEid] = level.resources.credits;
  PlayerResourceComponent.engineers[playerResourceEid] = level.resources.engineers;
  PlayerResourceComponent.excavators[playerResourceEid] = level.resources.excavators;
  PlayerResourceComponent.concreteMixers[playerResourceEid] =
    level.resources.concreteMixers;
  PlayerResourceComponent.reservoirWater[playerResourceEid] = 0;
  PlayerResourceComponent.lastGrossIncome[playerResourceEid] = 0;
  PlayerResourceComponent.lastPenalty[playerResourceEid] = 0;
  PlayerResourceComponent.lastNetIncome[playerResourceEid] = 0;
}

function clearConstructionWheel(): void {
  ConstructionWheelComponent.activeSlot[constructionWheelEid] = 0;
  ConstructionWheelComponent.slot0Excavators[constructionWheelEid] = 0;
  ConstructionWheelComponent.slot0ConcreteMixers[constructionWheelEid] = 0;
  ConstructionWheelComponent.slot1Excavators[constructionWheelEid] = 0;
  ConstructionWheelComponent.slot1ConcreteMixers[constructionWheelEid] = 0;
  ConstructionWheelComponent.slot2Excavators[constructionWheelEid] = 0;
  ConstructionWheelComponent.slot2ConcreteMixers[constructionWheelEid] = 0;
  ConstructionWheelComponent.slot3Excavators[constructionWheelEid] = 0;
  ConstructionWheelComponent.slot3ConcreteMixers[constructionWheelEid] = 0;
  ConstructionWheelComponent.slot4Excavators[constructionWheelEid] = 0;
  ConstructionWheelComponent.slot4ConcreteMixers[constructionWheelEid] = 0;
  ConstructionWheelComponent.slot5Excavators[constructionWheelEid] = 0;
  ConstructionWheelComponent.slot5ConcreteMixers[constructionWheelEid] = 0;
}

function loadLevel(level: LevelDefinition): void {
  currentLevel = level;
  campaignOutcome = 'playing';
  currentWeather = 'sunny';
  forceStormNextTurn = false;
  interactionMode = 'build';
  selectedCell = undefined;
  latestStats = {
    totalWaterDepthMeters: 0,
    maxWaterDepthMeters: 0,
    maxFlowCubicMetersPerSecond: 0,
  };
  latestObjectiveProgress = {
    turn: 0,
    credits: level.resources.credits,
    reservoirWaterCubicMeters: 0,
    hydropowerScore: 0,
    irrigationScore: 0,
    sustainabilityScore: 100,
    cumulativeNetIncomeCredits: 0,
    builtBaseDams: 0,
    builtElevationDamLevels: 0,
    builtConduits: 0,
    builtPowerhouses: 0,
  };
  builtBaseDams = 0;
  builtElevationDamLevels = 0;
  builtConduits = 0;
  builtPowerhouses = 0;
  cumulativeNetIncomeCredits = 0;
  topology = initializeBasin(level.seed);
  resetPlayerResources(level);
  clearConstructionWheel();
  gameActor.send({ type: 'RESET' });
  uiShell.setLevel(level);
  uiShell.clearEvents();
  uiShell.hideOutcome();
  uiShell.hideBuildMenu();
  uiShell.hideAddTileMenu();
  uiShell.hideMainMenu();
  uiShell.setMessage(`${level.title} loaded.`);
  uiShell.addEvent(`${level.title} started.`);
  if (level.objectives.maxTurns < 900) {
    uiShell.addEvent(`Turn limit: resolve the objective within ${level.objectives.maxTurns} turns.`);
  }
  if (level.objectives.minResolvedTurns !== undefined) {
    uiShell.addEvent(`Minimum hold: keep objectives satisfied through turn ${level.objectives.minResolvedTurns}.`);
  }
  if (level.weatherScript) {
    uiShell.addEvent(`Weather script: ${formatWeatherScript(level.weatherScript)}.`);
  } else {
    uiShell.addEvent('Sandbox weather: dry and monsoon seasons roll with Markov transitions.');
  }
  uiShell.addEvent(`Turn ${gameActor.getSnapshot().context.turn} planning opened.`);
  hydroRenderer.setCells(renderCells);
  hydroRenderer.update();
  updateHud();
}

const resolveWeatherForCommittedTurn = (): void => {
  if (gameActor.getSnapshot().value !== 'weatherPhase') {
    return;
  }

  const resolvingTurn = gameActor.getSnapshot().context.turn;
  const fixedCampaignWeather = getFixedCampaignWeatherForTurn(
    currentLevel,
    resolvingTurn,
  );
  const sandboxSeason = getSandboxSeasonForTurn(resolvingTurn);
  const season = currentLevel.id === SANDBOX_LEVEL.id ? sandboxSeason : 'dry';
  const weather = WeatherSystem(world, {
    season,
    currentState: forceStormNextTurn ? 'storm' : currentWeather,
    random01: forceStormNextTurn ? 0.99 : Math.random(),
    sampleDurationSeconds: WEATHER_EVENT_DURATION_SECONDS,
    forcedState: forceStormNextTurn ? 'storm' : fixedCampaignWeather,
  });

  currentWeather = weather.state;
  const seasonalWater = SeasonalWaterSourceSystem(world, {
    weather: weather.state,
    precipitationMeters: weather.precipitationMeters,
    evapotranspirationMeters: weather.evapotranspirationMeters,
  });
  forceStormNextTurn = false;
  gameActor.send({ type: 'WEATHER_RESOLVED', weather });
  uiShell.addEvent(
    currentLevel.id === SANDBOX_LEVEL.id
      ? `Turn ${resolvingTurn}: ${season} season rolled ${currentWeather}.`
      : `Turn ${resolvingTurn}: scripted weather is ${currentWeather}.`,
  );
  uiShell.addEvent(
    `Headwater: +${seasonalWater.sourceDepthMeters.toFixed(
      2,
    )} m source, +${seasonalWater.runoffDepthMeters.toFixed(
      2,
    )} m runoff, -${seasonalWater.evapotranspirationDepthMeters.toFixed(2)} m evap.`,
  );
  updateHud();
};

const executeQueuedBuildCommands = (): void => {
  if (gameActor.getSnapshot().value !== 'commandExecutionPhase') {
    return;
  }

  const queuedCommands = gameActor.getSnapshot().context.pendingBuildCommands;
  const results = queuedCommands.map((request) =>
    createBuildCommand(request.targetCellEid, request.buildType).execute({
      world,
      playerResourceEid,
      constructionWheelEid,
    }),
  );

  gameActor.send({
    type: 'COMMANDS_EXECUTED',
    results,
  });

  const failed = results.find((result) => !result.ok);
  const successCount = results.filter((result) => result.ok).length;

  uiShell.setMessage(
    failed?.message ??
      (results.length > 0
        ? `${successCount} construction job(s) started.`
        : 'No build orders queued; resolving water and economy.'),
  );
  for (const result of results) {
    uiShell.addEvent(
      result.ok
        ? `${result.buildType} construction started on cell ${result.targetCellEid}.`
        : `Build failed on cell ${result.targetCellEid}: ${result.message}`,
    );
  }
  uiShell.hideBuildMenu();
  uiShell.hideAddTileMenu();
  hydroRenderer.update();
  updateHud();
};

function queueBuild(buildType: InfrastructureBuildType): void {
  if (campaignOutcome !== 'playing' && currentLevel.id !== SANDBOX_LEVEL.id) {
    uiShell.setMessage(getCampaignEndedMessage());
    return;
  }

  if (!selectedCell) {
    return;
  }

  const validation = validateBuildRequest(selectedCell.eid, buildType);

  if (!validation.ok) {
    uiShell.setMessage(validation.reason);
    uiShell.addEvent(
      `${BUILD_LABELS[buildType]} at q${selectedCell.q}, r${selectedCell.r} not queued: ${validation.reason}`,
    );
    return;
  }

  const command: BuildCommandRequest = {
    id: `build:${selectedCell.eid}:${buildType}:${performance.now().toFixed(3)}`,
    targetCellEid: selectedCell.eid,
    buildType,
    issuedTurn: gameActor.getSnapshot().context.turn,
  };

  gameActor.send({
    type: 'QUEUE_BUILD_COMMAND',
    command,
  });
  uiShell.setMessage(
    `${BUILD_LABELS[buildType]} queued for q${selectedCell.q}, r${selectedCell.r}.`,
  );
  uiShell.addEvent(
    `${BUILD_LABELS[buildType]} queued at q${selectedCell.q}, r${selectedCell.r}.`,
  );
  uiShell.hideBuildMenu();
  updateHud();
}

function cancelBuildCommand(commandId: string): void {
  if (gameActor.getSnapshot().value !== 'planningPhase') {
    return;
  }

  const command = gameActor
    .getSnapshot()
    .context.pendingBuildCommands.find((candidate) => candidate.id === commandId);

  gameActor.send({ type: 'CANCEL_BUILD_COMMAND', commandId });

  if (command) {
    const cell = renderCells.find((candidate) => candidate.eid === command.targetCellEid);
    const targetLabel = cell ? `q${cell.q}, r${cell.r}` : `cell ${command.targetCellEid}`;

    uiShell.setMessage(`${BUILD_LABELS[command.buildType]} order removed.`);
    uiShell.addEvent(`${BUILD_LABELS[command.buildType]} at ${targetLabel} removed.`);
  }

  updateHud();
}

function toggleAddTileMode(): void {
  if (campaignOutcome !== 'playing' && currentLevel.id !== SANDBOX_LEVEL.id) {
    uiShell.setMessage(getCampaignEndedMessage());
    return;
  }

  if (!currentLevel.allowGridExpansion) {
    uiShell.setMessage('This level does not allow grid expansion.');
    uiShell.addEvent('Grid expansion is disabled for this level.');
    return;
  }

  interactionMode = interactionMode === 'build' ? 'addTile' : 'build';
  uiShell.hideBuildMenu();
  uiShell.hideAddTileMenu();
  uiShell.setMessage(
    interactionMode === 'addTile'
      ? 'Add Tile Mode: click an existing hex, then choose a direction.'
      : 'Build Mode: click a hex to place infrastructure.',
  );
  updateHud();
}

function addTileAdjacentToSelectedCell(direction: number): void {
  if (campaignOutcome !== 'playing' && currentLevel.id !== SANDBOX_LEVEL.id) {
    uiShell.setMessage(getCampaignEndedMessage());
    return;
  }

  if (gameActor.getSnapshot().value !== 'planningPhase') {
    uiShell.setMessage('Grid expansion is only available during Planning.');
    return;
  }

  if (!selectedCell) {
    return;
  }

  if (!currentLevel.allowGridExpansion) {
    uiShell.setMessage('This level does not allow grid expansion.');
    uiShell.hideAddTileMenu();
    return;
  }

  if (renderCells.length >= MAX_RENDER_CELLS) {
    uiShell.setMessage('Grid capacity reached for this prototype.');
    return;
  }

  if (getAvailableResourcesAfterPending().credits < GRID_EXPANSION_COST) {
    uiShell.setMessage('Not enough credits to survey and add a tile.');
    return;
  }

  const delta = HEX_DIRECTIONS[direction];

  if (!delta) {
    return;
  }

  const [dq, dr] = delta;
  const q = selectedCell.q + dq;
  const r = selectedCell.r + dr;

  if (eidByCoord.has(coordKey(q, r))) {
    uiShell.setMessage('That neighboring hex already exists.');
    return;
  }

  const sourceSeed = cellSeedByEid.get(selectedCell.eid);
  const sourceElevation = sourceSeed?.elevation ?? Terrain.elevation[selectedCell.eid];
  const elevation = sourceElevation - 0.08 + direction * 0.015;
  const seed: BasinCellSeed = {
    q,
    r,
    elevation,
    waterDepth: Math.max(0.02, Water.depth[selectedCell.eid] * 0.35),
    curveNumber: 70,
    structureType: StructureKind.none,
    damHeight: 0,
    maxWaterDepth: 0,
    sourceDepthPerTurn: 0,
    surfaceType: SurfaceKind.land,
  };
  const createdCell = createBasinCell(seed);

  PlayerResourceComponent.credits[playerResourceEid] -= GRID_EXPANSION_COST;
  topology = rebuildTopology();
  hydroRenderer.setCells(renderCells);
  selectedCell = createdCell;
  uiShell.hideAddTileMenu();
  uiShell.setMessage(`Added grid tile q${q}, r${r}.`);
  uiShell.addEvent(`New hex surveyed at q${q}, r${r} for ${GRID_EXPANSION_COST} credits.`);
  updateHud();
}

function commitPlanning(): void {
  if (campaignOutcome !== 'playing' && currentLevel.id !== SANDBOX_LEVEL.id) {
    uiShell.setMessage(getCampaignEndedMessage());
    return;
  }

  const snapshot = gameActor.getSnapshot();

  if (snapshot.value !== 'planningPhase') {
    return;
  }

  const committedTurn = snapshot.context.turn;

  gameActor.send({ type: 'COMMIT_PLANNING' });
  uiShell.hideBuildMenu();
  uiShell.hideAddTileMenu();
  uiShell.setMessage(`Turn ${committedTurn} committed. Resolving basin.`);
  uiShell.addEvent(`Turn ${committedTurn} committed.`);
  updateHud();
  resolveWeatherForCommittedTurn();
  executeQueuedBuildCommands();
}

const finalizeRound = (): void => {
  const release = ConstructionWheelSystem(world);
  const completedConstruction = ConstructionProgressSystem(world);
  const economy = ResourceEconomySystem(world, {
    playerResourceEid,
    neighborEids: topology.neighborEids,
    directionCount: topology.directionCount,
  });
  const resolvedTurn = gameActor.getSnapshot().context.turn;
  cumulativeNetIncomeCredits += economy.netIncomeCredits;

  for (const completed of completedConstruction) {
    if (completed.structureType === StructureKind.baseDam) {
      builtBaseDams += 1;
    } else if (completed.structureType === StructureKind.elevationDam) {
      builtElevationDamLevels += 1;
    } else if (completed.structureType === StructureKind.conduit) {
      builtConduits += 1;
    } else if (completed.structureType === StructureKind.powerhouse) {
      builtPowerhouses += 1;
    }
  }

  latestObjectiveProgress = {
    turn: resolvedTurn,
    credits: PlayerResourceComponent.credits[playerResourceEid],
    reservoirWaterCubicMeters: economy.reservoirWaterCubicMeters,
    hydropowerScore: economy.hydropowerScore,
    irrigationScore: economy.irrigationScore,
    sustainabilityScore: economy.sustainabilityScore,
    cumulativeNetIncomeCredits,
    builtBaseDams,
    builtElevationDamLevels,
    builtConduits,
    builtPowerhouses,
  };

  PlayerResourceComponent.engineers[playerResourceEid] =
    currentLevel.resources.engineers;

  gameActor.send({
    type: 'EVALUATION_COMPLETE',
    scores: {
      hydropower: economy.hydropowerScore,
      floodControl: economy.floodControlScore,
      irrigation: economy.irrigationScore,
      navigation: Math.max(0, 100 - latestStats.maxFlowCubicMetersPerSecond * 8),
      sustainability: economy.sustainabilityScore,
    },
    ecosystemFeedback: [],
  });

  uiShell.setMessage(
    release.excavators + release.concreteMixers > 0
      ? `Wheel released ${release.excavators} excavator(s), ${release.concreteMixers} mixer(s).`
      : `Turn ${resolvedTurn} resolved. Planning reopened.`,
  );
  uiShell.addEvent(
    `Economy: +${economy.grossIncomeCredits} income, -${economy.totalPenaltyCredits} penalty, net ${economy.netIncomeCredits}.`,
  );
  for (const completed of completedConstruction) {
    uiShell.addEvent(
      `${STRUCTURE_KIND_LABELS[completed.structureType] ?? 'Structure'} completed on cell ${completed.eid}.`,
    );
  }
  uiShell.addEvent(
    `Stored Water: ${Math.round(economy.reservoirWaterCubicMeters)} m3; hydro +${economy.hydropowerCredits}, irrigation +${economy.irrigationCredits}.`,
  );
  if (economy.reservoirWaterCubicMeters > 100 && economy.hydropowerCredits === 0) {
    uiShell.addEvent('Stored water is a reserve; it needs a Powerhouse and flow path to become credits.');
  }
  evaluateLevelObjectives();
  if (campaignOutcome === 'playing') {
    uiShell.addEvent(
      `Planning opened for turn ${gameActor.getSnapshot().context.turn}.`,
    );
  }
  updateHud();
};

function evaluateLevelObjectives(): void {
  if (currentLevel.id === SANDBOX_LEVEL.id || campaignOutcome !== 'playing') {
    return;
  }

  const objectives = currentLevel.objectives;
  const progress = latestObjectiveProgress;
  const complete =
    progress.turn <= objectives.maxTurns &&
    (objectives.minResolvedTurns === undefined ||
      progress.turn >= objectives.minResolvedTurns) &&
    (objectives.minCredits === undefined ||
      progress.credits >= objectives.minCredits) &&
    (objectives.minCumulativeNetIncomeCredits === undefined ||
      progress.cumulativeNetIncomeCredits >=
        objectives.minCumulativeNetIncomeCredits) &&
    (objectives.minBuiltBaseDams === undefined ||
      progress.builtBaseDams >= objectives.minBuiltBaseDams) &&
    (objectives.minBuiltElevationDamLevels === undefined ||
      progress.builtElevationDamLevels >= objectives.minBuiltElevationDamLevels) &&
    (objectives.minBuiltConduits === undefined ||
      progress.builtConduits >= objectives.minBuiltConduits) &&
    (objectives.minBuiltPowerhouses === undefined ||
      progress.builtPowerhouses >= objectives.minBuiltPowerhouses) &&
    (objectives.minReservoirWaterCubicMeters === undefined ||
      progress.reservoirWaterCubicMeters >=
        objectives.minReservoirWaterCubicMeters) &&
    (objectives.minHydropowerScore === undefined ||
      progress.hydropowerScore >= objectives.minHydropowerScore) &&
    (objectives.minIrrigationScore === undefined ||
      progress.irrigationScore >= objectives.minIrrigationScore) &&
    (objectives.minSustainabilityScore === undefined ||
      progress.sustainabilityScore >= objectives.minSustainabilityScore);

  if (complete) {
    const nextLevel = getNextCampaignLevel();

    campaignOutcome = 'complete';
    uiShell.setMessage(`${currentLevel.title} complete on turn ${progress.turn}.`);
    uiShell.addEvent(
      `${currentLevel.title} objective complete on turn ${progress.turn}/${objectives.maxTurns}.`,
    );
    uiShell.showOutcome(
      currentLevel.title,
      nextLevel
        ? `Objective complete on turn ${progress.turn}/${objectives.maxTurns}. Continue to ${nextLevel.title} or return to Menu.`
        : `Objective complete on turn ${progress.turn}/${objectives.maxTurns}. Campaign complete; return to Menu to replay any level.`,
      'complete',
      {
        primaryAction: nextLevel ? 'nextLevel' : 'none',
      },
    );
    return;
  }

  if (progress.turn >= objectives.maxTurns) {
    campaignOutcome = 'failed';
    uiShell.setMessage(
      `${currentLevel.title} failed at turn ${progress.turn}/${objectives.maxTurns}.`,
    );
    uiShell.addEvent(
      `${currentLevel.title} failed: turn limit ${objectives.maxTurns} reached.`,
    );
    uiShell.showOutcome(
      'Game Over',
      `${currentLevel.title} reached the ${objectives.maxTurns}-turn limit before the objective was complete. Retry and adjust dam placement, stored water, or spending.`,
      'failed',
    );
  }
}

const simulateTick = (): void => {
  if (gameActor.getSnapshot().value !== 'simulationPhase') {
    return;
  }

  SoilInfiltrationSystem(world, {
    deltaTimeSeconds: SIMULATION_CONSTANTS.timeStepSeconds,
    etaMeters: SIMULATION_CONSTANTS.infiltrationEtaMeters,
    includeEvapotranspiration: true,
  });

  latestStats = ShallowWaterSystem(world, {
    topology,
    constants: SIMULATION_CONSTANTS,
  });

  hydroRenderer.update();
  gameActor.send({ type: 'SIMULATION_TICKED' });

  if (gameActor.getSnapshot().value === 'evaluationPhase') {
    finalizeRound();
  } else {
    updateHud(latestStats);
  }
};

function resetBasin(): void {
  loadLevel(currentLevel);
  uiShell.setMessage('Basin, resources, and turn counter reset.');
  uiShell.addEvent('Basin reset to the start of the current level.');
}

gameActor.start();
uiShell.setLevel(SANDBOX_LEVEL);
uiShell.addEvent(`Turn ${gameActor.getSnapshot().context.turn} planning opened.`);
updateHud();
hydroRenderer.start();
window.setInterval(simulateTick, 33);
