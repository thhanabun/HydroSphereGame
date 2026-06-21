import { defineQuery, type IWorld } from 'bitecs';

import {
  HEX_DIRECTION_COUNT,
  NO_NEIGHBOR,
  PlayerResourceComponent,
  StructureComponent,
  StructureKind,
  SurfaceKind,
  Terrain,
  Water,
  getFlow,
  oppositeDirection,
} from '../components';

export interface ResourceEconomyInput {
  readonly playerResourceEid: number;
  readonly neighborEids?: Int32Array;
  readonly directionCount?: 4 | typeof HEX_DIRECTION_COUNT;
}

export interface ResourceEconomyReport {
  readonly reservoirWaterCubicMeters: number;
  readonly hydropowerCredits: number;
  readonly irrigationCredits: number;
  readonly floodPenaltyCredits: number;
  readonly droughtPenaltyCredits: number;
  readonly grossIncomeCredits: number;
  readonly totalPenaltyCredits: number;
  readonly netIncomeCredits: number;
  readonly hydropowerScore: number;
  readonly floodControlScore: number;
  readonly irrigationScore: number;
  readonly sustainabilityScore: number;
}

const economyQuery = defineQuery([Terrain, Water, StructureComponent]);

const isDam = (eid: number): boolean =>
  StructureComponent.active[eid] === 1 &&
  (StructureComponent.type[eid] === StructureKind.baseDam ||
    StructureComponent.type[eid] === StructureKind.elevationDam);

const isPowerhouse = (eid: number): boolean =>
  StructureComponent.active[eid] === 1 &&
  StructureComponent.type[eid] === StructureKind.powerhouse;

const isConduit = (eid: number): boolean =>
  StructureComponent.active[eid] === 1 &&
  StructureComponent.type[eid] === StructureKind.conduit;

const getUncontrolledFloodDepth = (eid: number, waterDepth: number): number => {
  if (isDam(eid)) {
    const controlledStorageDepth = Math.max(
      0,
      StructureComponent.maxWaterDepth[eid],
    );

    return Math.max(0, waterDepth - controlledStorageDepth - 0.25);
  }

  if (isConduit(eid)) {
    return Math.max(0, waterDepth - 0.95);
  }

  return Math.max(0, waterDepth - 0.85);
};

const getNeighborEid = (
  input: ResourceEconomyInput,
  eid: number,
  direction: number,
): number => {
  const directionCount = input.directionCount ?? HEX_DIRECTION_COUNT;

  return input.neighborEids?.[eid * directionCount + direction] ?? NO_NEIGHBOR;
};

const hasConduitIrrigationSupport = (
  input: ResourceEconomyInput,
  eid: number,
): boolean => {
  if (isConduit(eid)) {
    return true;
  }

  if (!input.neighborEids) {
    return false;
  }

  const directionCount = input.directionCount ?? HEX_DIRECTION_COUNT;

  for (let direction = 0; direction < directionCount; direction += 1) {
    const neighborEid = getNeighborEid(input, eid, direction);

    if (neighborEid !== NO_NEIGHBOR && Terrain.active[neighborEid] === 1) {
      if (isConduit(neighborEid)) {
        return true;
      }
    }
  }

  return false;
};

const getOppositeDirection = (
  directionCount: 4 | typeof HEX_DIRECTION_COUNT,
  direction: number,
): number =>
  directionCount === HEX_DIRECTION_COUNT
    ? oppositeDirection(direction)
    : (direction + directionCount / 2) % directionCount;

const getReservoirReleasePotential = (
  input: ResourceEconomyInput,
  powerhouseEid: number,
): number => {
  if (!input.neighborEids) {
    return 0;
  }

  const directionCount = input.directionCount ?? HEX_DIRECTION_COUNT;
  const powerhouseHead =
    Terrain.elevation[powerhouseEid] + Math.max(0, Water.depth[powerhouseEid]);
  let releasePotential = 0;

  for (let direction = 0; direction < directionCount; direction += 1) {
    const neighborEid = getNeighborEid(input, powerhouseEid, direction);

    if (neighborEid === NO_NEIGHBOR || Terrain.active[neighborEid] === 0) {
      continue;
    }

    if (!isDam(neighborEid)) {
      continue;
    }

    const storedDepth = Math.min(
      Math.max(0, Water.depth[neighborEid]),
      Math.max(0, StructureComponent.maxWaterDepth[neighborEid]),
    );

    if (storedDepth <= 0) {
      continue;
    }

    const damHead =
      Terrain.elevation[neighborEid] +
      storedDepth +
      Math.max(0, StructureComponent.damHeight[neighborEid]);
    const headDrop = Math.max(0, damHead - powerhouseHead);
    const intakeFlow = Math.min(
      Math.max(0, StructureComponent.dischargeCapacity[powerhouseEid]),
      headDrop * 0.45,
    );

    if (intakeFlow > releasePotential) {
      releasePotential = intakeFlow;
    }
  }

  return releasePotential;
};

const getNeighborFlowPotential = (
  input: ResourceEconomyInput,
  powerhouseEid: number,
): number => {
  if (!input.neighborEids) {
    return 0;
  }

  const directionCount = input.directionCount ?? HEX_DIRECTION_COUNT;
  let neighborFlow = 0;

  for (let direction = 0; direction < directionCount; direction += 1) {
    const neighborEid = getNeighborEid(input, powerhouseEid, direction);

    if (neighborEid === NO_NEIGHBOR || Terrain.active[neighborEid] === 0) {
      continue;
    }

    neighborFlow += getFlow(
      neighborEid,
      getOppositeDirection(directionCount, direction),
    );
  }

  return neighborFlow;
};

export const ResourceEconomySystem = (
  world: IWorld,
  input: ResourceEconomyInput,
): ResourceEconomyReport => {
  const eids = economyQuery(world);
  let reservoirWaterCubicMeters = 0;
  let hydropowerCredits = 0;
  let irrigationCredits = 0;
  let floodPenaltyCredits = 0;
  let droughtPenaltyCredits = 0;
  let floodedCells = 0;
  let droughtCells = 0;
  let productiveIrrigationCells = 0;
  let activeCells = 0;
  let farmSurfaceCells = 0;

  for (let index = 0; index < eids.length; index += 1) {
    const eid = eids[index];

    if (Terrain.active[eid] === 0) {
      continue;
    }

    activeCells += 1;

    const cellArea =
      Math.max(1, Terrain.cellWidth[eid]) * Math.max(1, Terrain.cellHeight[eid]);
    const waterDepth = Math.max(0, Water.depth[eid]);

    if (isDam(eid)) {
      const storedDepth = Math.min(
        waterDepth,
        Math.max(0, StructureComponent.maxWaterDepth[eid]),
      );
      const storedVolume = storedDepth * cellArea;

      StructureComponent.storageDepth[eid] = storedDepth;
      reservoirWaterCubicMeters += storedVolume;
    }

    if (isPowerhouse(eid)) {
      const usableFlow = Math.min(
        Math.max(
          0,
          Water.inflow[eid] +
            Water.outflow[eid] +
            getNeighborFlowPotential(input, eid) +
            getReservoirReleasePotential(input, eid),
        ),
        Math.max(0, StructureComponent.dischargeCapacity[eid]),
      );

      hydropowerCredits += Math.round(
        usableFlow * Math.max(0, StructureComponent.efficiency[eid]) * 120,
      );
    }

    const isFarmSurface =
      Terrain.surfaceType[eid] === SurfaceKind.land ||
      Terrain.surfaceType[eid] === SurfaceKind.shore;
    if (isFarmSurface) {
      farmSurfaceCells += 1;
    }
    const isNaturallyIrrigated =
      isFarmSurface && waterDepth >= 0.05 && waterDepth <= 0.55;
    const isCanalSupplied =
      isFarmSurface &&
      hasConduitIrrigationSupport(input, eid) &&
      waterDepth >= 0.02 &&
      waterDepth <= 0.65;

    if (isNaturallyIrrigated || isCanalSupplied) {
      productiveIrrigationCells += 1;
      irrigationCredits += 8;
    }

    const uncontrolledFloodDepth = getUncontrolledFloodDepth(eid, waterDepth);

    if (uncontrolledFloodDepth > 0) {
      floodedCells += 1;
      floodPenaltyCredits += Math.round(uncontrolledFloodDepth * 26);
    }

    if (isFarmSurface && waterDepth < 0.015) {
      droughtCells += 1;
      droughtPenaltyCredits += 2;
    }
  }

  const grossIncomeCredits = hydropowerCredits + irrigationCredits;
  const totalPenaltyCredits = floodPenaltyCredits + droughtPenaltyCredits;
  const netIncomeCredits = grossIncomeCredits - totalPenaltyCredits;
  const floodedRatio = floodedCells / Math.max(1, activeCells);
  const droughtRatio = droughtCells / Math.max(1, farmSurfaceCells);

  PlayerResourceComponent.credits[input.playerResourceEid] += netIncomeCredits;
  PlayerResourceComponent.reservoirWater[input.playerResourceEid] =
    reservoirWaterCubicMeters;
  PlayerResourceComponent.lastGrossIncome[input.playerResourceEid] =
    grossIncomeCredits;
  PlayerResourceComponent.lastPenalty[input.playerResourceEid] =
    totalPenaltyCredits;
  PlayerResourceComponent.lastNetIncome[input.playerResourceEid] =
    netIncomeCredits;

  return {
    reservoirWaterCubicMeters,
    hydropowerCredits,
    irrigationCredits,
    floodPenaltyCredits,
    droughtPenaltyCredits,
    grossIncomeCredits,
    totalPenaltyCredits,
    netIncomeCredits,
    hydropowerScore: Math.min(100, hydropowerCredits * 2),
    floodControlScore: Math.max(
      0,
      100 - floodedRatio * 70 - Math.min(30, floodPenaltyCredits),
    ),
    irrigationScore: Math.min(100, productiveIrrigationCells * 14),
    sustainabilityScore: Math.max(
      0,
      100 - floodedRatio * 55 - droughtRatio * 35,
    ),
  };
};
