import { defineQuery, type IWorld } from 'bitecs';

import { StructureComponent, StructureKind, Terrain } from '../components';

export interface CompletedStructureConstruction {
  readonly eid: number;
  readonly structureType: number;
}

const structureConstructionQuery = defineQuery([Terrain, StructureComponent]);

const clearPendingConstruction = (eid: number): void => {
  StructureComponent.pendingType[eid] = StructureKind.none;
  StructureComponent.constructionTurnsRemaining[eid] = 0;
  StructureComponent.constructionTotalTurns[eid] = 0;
  StructureComponent.pendingDischargeCapacity[eid] = 0;
  StructureComponent.pendingDamHeight[eid] = 0;
  StructureComponent.pendingMaxWaterDepth[eid] = 0;
  StructureComponent.pendingEfficiency[eid] = 0;
  StructureComponent.pendingGateOpening[eid] = 0;
};

const completeConstruction = (eid: number): void => {
  const pendingType = StructureComponent.pendingType[eid];

  if (pendingType === StructureKind.none) {
    clearPendingConstruction(eid);
    StructureComponent.constructionProgress[eid] = 1;
    return;
  }

  if (pendingType === StructureKind.elevationDam) {
    StructureComponent.type[eid] = StructureKind.elevationDam;
    StructureComponent.level[eid] = Math.max(1, StructureComponent.level[eid] + 1);
  } else {
    StructureComponent.type[eid] = pendingType;
    StructureComponent.level[eid] = 1;
  }

  StructureComponent.active[eid] = 1;
  StructureComponent.dischargeCapacity[eid] =
    StructureComponent.pendingDischargeCapacity[eid];
  StructureComponent.damHeight[eid] += StructureComponent.pendingDamHeight[eid];
  StructureComponent.maxWaterDepth[eid] += StructureComponent.pendingMaxWaterDepth[eid];
  StructureComponent.capacity[eid] = StructureComponent.maxWaterDepth[eid];
  StructureComponent.efficiency[eid] = StructureComponent.pendingEfficiency[eid];
  StructureComponent.gateOpening[eid] = StructureComponent.pendingGateOpening[eid];
  StructureComponent.constructionProgress[eid] = 1;
  clearPendingConstruction(eid);
};

export const ConstructionProgressSystem = (
  world: IWorld,
): CompletedStructureConstruction[] => {
  const eids = structureConstructionQuery(world);
  const completed: CompletedStructureConstruction[] = [];

  for (let index = 0; index < eids.length; index += 1) {
    const eid = eids[index];
    const turnsRemaining = StructureComponent.constructionTurnsRemaining[eid];
    const totalTurns = StructureComponent.constructionTotalTurns[eid];

    if (Terrain.active[eid] === 0) {
      continue;
    }

    if (turnsRemaining <= 0 || totalTurns <= 0) {
      continue;
    }

    const nextTurnsRemaining = Math.max(0, turnsRemaining - 1);

    StructureComponent.constructionTurnsRemaining[eid] = nextTurnsRemaining;
    StructureComponent.constructionProgress[eid] =
      (totalTurns - nextTurnsRemaining) / totalTurns;

    if (nextTurnsRemaining === 0) {
      const pendingType = StructureComponent.pendingType[eid];

      completeConstruction(eid);
      completed.push({
        eid,
        structureType: pendingType,
      });
    }
  }

  return completed;
};
