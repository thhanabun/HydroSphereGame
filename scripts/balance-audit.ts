import { addComponent, addEntity, createWorld } from 'bitecs';

import { createBuildCommand, type InfrastructureBuildType } from '../src/core/commands/buildCommands';
import {
  ConstructionWheelComponent,
  Infiltration,
  PlayerResourceComponent,
  Position,
  Structure,
  StructureKind,
  Terrain,
  Water,
  WaterSource,
} from '../src/core/ecs/components';
import { ConstructionWheelSystem } from '../src/core/ecs/systems/constructionWheelSystem';
import {
  ConstructionProgressSystem,
  ResourceEconomySystem,
  SeasonalWaterSourceSystem,
  ShallowWaterSystem,
  SoilInfiltrationSystem,
  WeatherSystem,
} from '../src/core/ecs/systems';
import { CAMPAIGN_LEVELS, type BasinCellSeed, type LevelDefinition } from '../src/core/levels';
import type { SimulationConstants, WeatherState } from '../src/core/types';

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

const ROUTES: Readonly<
  Record<
    string,
    readonly {
      readonly turn: number;
      readonly q: number;
      readonly r: number;
      readonly buildType: InfrastructureBuildType;
    }[]
  >
> = {
  'level-1': [{ turn: 1, q: 0, r: 0, buildType: 'baseDam' }],
  'level-2': [{ turn: 1, q: -1, r: 1, buildType: 'powerhouse' }],
  'level-3': [{ turn: 1, q: 1, r: 1, buildType: 'conduit' }],
  'level-4': [{ turn: 1, q: 0, r: 0, buildType: 'elevationDam' }],
  'level-5': [
    { turn: 1, q: 1, r: 0, buildType: 'powerhouse' },
    { turn: 1, q: -2, r: 1, buildType: 'conduit' },
  ],
  'level-6': [
    { turn: 1, q: -2, r: 0, buildType: 'conduit' },
    { turn: 1, q: 2, r: -1, buildType: 'conduit' },
  ],
  'level-7': [
    { turn: 1, q: 0, r: 0, buildType: 'elevationDam' },
    { turn: 1, q: 1, r: 0, buildType: 'powerhouse' },
  ],
};

const coordKey = (q: number, r: number): string => `${q},${r}`;

const isComplete = (
  level: LevelDefinition,
  progress: {
    readonly turn: number;
    readonly credits: number;
    readonly storedWater: number;
    readonly hydropower: number;
    readonly irrigation: number;
    readonly sustainability: number;
    readonly cumulativeIncome: number;
    readonly baseDams: number;
    readonly elevations: number;
    readonly conduits: number;
    readonly powerhouses: number;
  },
): boolean => {
  const objectives = level.objectives;

  return (
    progress.turn <= objectives.maxTurns &&
    (objectives.minResolvedTurns === undefined || progress.turn >= objectives.minResolvedTurns) &&
    (objectives.minCredits === undefined || progress.credits >= objectives.minCredits) &&
    (objectives.minReservoirWaterCubicMeters === undefined ||
      progress.storedWater >= objectives.minReservoirWaterCubicMeters) &&
    (objectives.minHydropowerScore === undefined ||
      progress.hydropower >= objectives.minHydropowerScore) &&
    (objectives.minIrrigationScore === undefined ||
      progress.irrigation >= objectives.minIrrigationScore) &&
    (objectives.minSustainabilityScore === undefined ||
      progress.sustainability >= objectives.minSustainabilityScore) &&
    (objectives.minCumulativeNetIncomeCredits === undefined ||
      progress.cumulativeIncome >= objectives.minCumulativeNetIncomeCredits) &&
    (objectives.minBuiltBaseDams === undefined || progress.baseDams >= objectives.minBuiltBaseDams) &&
    (objectives.minBuiltElevationDamLevels === undefined ||
      progress.elevations >= objectives.minBuiltElevationDamLevels) &&
    (objectives.minBuiltConduits === undefined || progress.conduits >= objectives.minBuiltConduits) &&
    (objectives.minBuiltPowerhouses === undefined ||
      progress.powerhouses >= objectives.minBuiltPowerhouses)
  );
};

const initializeCell = (
  world: ReturnType<typeof createWorld>,
  seed: BasinCellSeed,
): number => {
  const eid = addEntity(world);

  addComponent(world, Position, eid);
  addComponent(world, Terrain, eid);
  addComponent(world, Water, eid);
  addComponent(world, WaterSource, eid);
  addComponent(world, Infiltration, eid);
  addComponent(world, Structure, eid);

  Position.q[eid] = seed.q;
  Position.r[eid] = seed.r;
  Position.s[eid] = -seed.q - seed.r;
  Terrain.elevation[eid] = seed.elevation;
  Terrain.cellWidth[eid] = SIMULATION_CONSTANTS.cellWidthMeters;
  Terrain.cellHeight[eid] = SIMULATION_CONSTANTS.cellHeightMeters;
  Terrain.roughness[eid] = 0.04;
  Terrain.curveNumber[eid] = seed.curveNumber;
  Terrain.soilType[eid] = 3;
  Terrain.biomeType[eid] = 1;
  Terrain.surfaceType[eid] = seed.surfaceType ?? 0;
  Terrain.active[eid] = 1;
  Water.depth[eid] = seed.waterDepth;
  Water.previousDepth[eid] = seed.waterDepth;
  Water.hydraulicHead[eid] = seed.elevation + seed.waterDepth + seed.damHeight;
  WaterSource.active[eid] = (seed.sourceDepthPerTurn ?? 0) > 0 ? 1 : 0;
  WaterSource.baseDepthPerTurn[eid] = seed.sourceDepthPerTurn ?? 0;
  Infiltration.saturatedHydraulicConductivity[eid] = 0.000006;
  Infiltration.wettingFrontSuctionHead[eid] = 0.18;
  Infiltration.soilMoistureDeficit[eid] = 0.32;
  Infiltration.cumulativeDepth[eid] = 0.001;
  Structure.type[eid] = seed.structureType;
  Structure.level[eid] = seed.structureType === StructureKind.none ? 0 : 1;
  Structure.active[eid] = seed.structureType === StructureKind.none ? 0 : 1;
  Structure.pendingType[eid] = StructureKind.none;
  Structure.dischargeCapacity[eid] = seed.structureType === StructureKind.baseDam ? 0.22 : 0.3;
  Structure.damHeight[eid] = seed.damHeight;
  Structure.maxWaterDepth[eid] = seed.maxWaterDepth;
  Structure.capacity[eid] = seed.maxWaterDepth;
  Structure.constructionProgress[eid] = 1;
  Structure.efficiency[eid] = seed.structureType === StructureKind.powerhouse ? 0.78 : 0;
  Structure.gateOpening[eid] = seed.structureType === StructureKind.powerhouse ? 1 : 0.25;
  Structure.conduitTarget[eid] = -1;

  return eid;
};

const auditLevel = (level: LevelDefinition): { readonly passed: boolean; readonly summary: string } => {
  const world = createWorld();
  const playerEid = addEntity(world);
  const wheelEid = addEntity(world);
  const eidByCoord = new Map<string, number>();

  addComponent(world, PlayerResourceComponent, playerEid);
  addComponent(world, ConstructionWheelComponent, wheelEid);
  PlayerResourceComponent.credits[playerEid] = level.resources.credits;
  PlayerResourceComponent.engineers[playerEid] = level.resources.engineers;
  PlayerResourceComponent.excavators[playerEid] = level.resources.excavators;
  PlayerResourceComponent.concreteMixers[playerEid] = level.resources.concreteMixers;

  for (const seed of level.seed) {
    eidByCoord.set(coordKey(seed.q, seed.r), initializeCell(world, seed));
  }

  const maxEid = Math.max(...eidByCoord.values());
  const neighborEids = new Int32Array((maxEid + 1) * 6);
  neighborEids.fill(-1);
  for (const seed of level.seed) {
    const eid = eidByCoord.get(coordKey(seed.q, seed.r));
    if (eid === undefined) continue;
    for (let direction = 0; direction < 6; direction += 1) {
      const [dq, dr] = HEX_DIRECTIONS[direction];
      neighborEids[eid * 6 + direction] = eidByCoord.get(coordKey(seed.q + dq, seed.r + dr)) ?? -1;
    }
  }

  let currentWeather: WeatherState = 'sunny';
  let cumulativeIncome = 0;
  let baseDams = 0;
  let elevations = 0;
  let conduits = 0;
  let powerhouses = 0;
  let lastSummary = '';

  for (let turn = 1; turn <= level.objectives.maxTurns; turn += 1) {
    const forcedWeather =
      level.weatherScript?.[Math.min(turn - 1, level.weatherScript.length - 1)] ?? 'sunny';
    const weather = WeatherSystem(world, {
      season: 'dry',
      currentState: currentWeather,
      random01: 0.5,
      sampleDurationSeconds: 21600,
      forcedState: forcedWeather,
    });
    currentWeather = weather.state;
    SeasonalWaterSourceSystem(world, {
      weather: weather.state,
      precipitationMeters: weather.precipitationMeters,
      evapotranspirationMeters: weather.evapotranspirationMeters,
    });

    for (const order of ROUTES[level.id] ?? []) {
      if (order.turn !== turn) continue;
      const targetEid = eidByCoord.get(coordKey(order.q, order.r));
      if (targetEid === undefined) throw new Error(`${level.id}: missing route cell ${order.q},${order.r}`);
      const result = createBuildCommand(targetEid, order.buildType).execute({
        world,
        playerResourceEid: playerEid,
        constructionWheelEid: wheelEid,
      });
      if (!result.ok) throw new Error(`${level.id}: ${order.buildType} failed: ${result.message}`);
    }

    for (let tick = 0; tick < 96; tick += 1) {
      SoilInfiltrationSystem(world, {
        deltaTimeSeconds: SIMULATION_CONSTANTS.timeStepSeconds,
        etaMeters: SIMULATION_CONSTANTS.infiltrationEtaMeters,
        includeEvapotranspiration: true,
      });
      ShallowWaterSystem(world, {
        topology: { neighborEids, directionCount: 6 },
        constants: SIMULATION_CONSTANTS,
      });
    }

    ConstructionWheelSystem(world);
    const completed = ConstructionProgressSystem(world);
    for (const structure of completed) {
      if (structure.structureType === StructureKind.baseDam) baseDams += 1;
      if (structure.structureType === StructureKind.elevationDam) elevations += 1;
      if (structure.structureType === StructureKind.conduit) conduits += 1;
      if (structure.structureType === StructureKind.powerhouse) powerhouses += 1;
    }
    const economy = ResourceEconomySystem(world, {
      playerResourceEid: playerEid,
      neighborEids,
      directionCount: 6,
    });
    cumulativeIncome += economy.netIncomeCredits;
    PlayerResourceComponent.engineers[playerEid] = level.resources.engineers;

    const progress = {
      turn,
      credits: PlayerResourceComponent.credits[playerEid],
      storedWater: economy.reservoirWaterCubicMeters,
      hydropower: economy.hydropowerScore,
      irrigation: economy.irrigationScore,
      sustainability: economy.sustainabilityScore,
      cumulativeIncome,
      baseDams,
      elevations,
      conduits,
      powerhouses,
    };
    lastSummary = `T${turn} cr=${progress.credits} water=${Math.round(progress.storedWater)} hydro=${Math.round(progress.hydropower)} irrigation=${Math.round(progress.irrigation)} sustain=${Math.round(progress.sustainability)} income=${progress.cumulativeIncome}`;

    if (isComplete(level, progress)) {
      return { passed: true, summary: lastSummary };
    }
  }

  return { passed: false, summary: lastSummary };
};

let failed = false;
for (const level of CAMPAIGN_LEVELS) {
  const result = auditLevel(level);
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${level.id} ${result.summary}`);
  failed ||= !result.passed;
}

if (failed) {
  process.exitCode = 1;
}
