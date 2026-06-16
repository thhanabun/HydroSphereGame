import { defineQuery, type IWorld } from 'bitecs';

import {
  PlayerResourceComponent,
  StructureComponent,
  StructureKind,
  Terrain,
  Water,
} from '../components';

export interface ResourceEconomyInput {
  readonly playerResourceEid: number;
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

  for (let index = 0; index < eids.length; index += 1) {
    const eid = eids[index];

    if (Terrain.active[eid] === 0) {
      continue;
    }

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
        Math.max(0, Water.inflow[eid] + Water.outflow[eid]),
        Math.max(0, StructureComponent.dischargeCapacity[eid]),
      );

      hydropowerCredits += Math.round(
        usableFlow * Math.max(0, StructureComponent.efficiency[eid]) * 120,
      );
    }

    if (waterDepth >= 0.05 && waterDepth <= 0.55) {
      productiveIrrigationCells += 1;
      irrigationCredits += 8;
    }

    if (waterDepth > 0.8) {
      floodedCells += 1;
      floodPenaltyCredits += Math.round((waterDepth - 0.8) * 45);
    }

    if (waterDepth < 0.015) {
      droughtCells += 1;
      droughtPenaltyCredits += 6;
    }
  }

  const grossIncomeCredits = hydropowerCredits + irrigationCredits;
  const totalPenaltyCredits = floodPenaltyCredits + droughtPenaltyCredits;
  const netIncomeCredits = grossIncomeCredits - totalPenaltyCredits;

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
    floodControlScore: Math.max(0, 100 - floodedCells * 16 - floodPenaltyCredits),
    irrigationScore: Math.min(100, productiveIrrigationCells * 14),
    sustainabilityScore: Math.max(0, 100 - floodedCells * 12 - droughtCells * 10),
  };
};
