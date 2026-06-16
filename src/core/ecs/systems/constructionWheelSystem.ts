import { defineQuery, type IWorld } from 'bitecs';

import {
  ConstructionWheelComponent,
  PlayerResourceComponent,
} from '../components';
import { CONSTRUCTION_WHEEL_SLOT_COUNT } from '../../commands/buildCommands';

export interface ConstructionWheelRelease {
  readonly excavators: number;
  readonly concreteMixers: number;
  readonly activeSlot: number;
}

const constructionWheelQuery = defineQuery([ConstructionWheelComponent]);
const playerResourceQuery = defineQuery([PlayerResourceComponent]);

const getSlotExcavators = (wheelEid: number, slot: number): number => {
  switch (slot) {
    case 0:
      return ConstructionWheelComponent.slot0Excavators[wheelEid];
    case 1:
      return ConstructionWheelComponent.slot1Excavators[wheelEid];
    case 2:
      return ConstructionWheelComponent.slot2Excavators[wheelEid];
    case 3:
      return ConstructionWheelComponent.slot3Excavators[wheelEid];
    case 4:
      return ConstructionWheelComponent.slot4Excavators[wheelEid];
    case 5:
      return ConstructionWheelComponent.slot5Excavators[wheelEid];
    default:
      return 0;
  }
};

const getSlotConcreteMixers = (wheelEid: number, slot: number): number => {
  switch (slot) {
    case 0:
      return ConstructionWheelComponent.slot0ConcreteMixers[wheelEid];
    case 1:
      return ConstructionWheelComponent.slot1ConcreteMixers[wheelEid];
    case 2:
      return ConstructionWheelComponent.slot2ConcreteMixers[wheelEid];
    case 3:
      return ConstructionWheelComponent.slot3ConcreteMixers[wheelEid];
    case 4:
      return ConstructionWheelComponent.slot4ConcreteMixers[wheelEid];
    case 5:
      return ConstructionWheelComponent.slot5ConcreteMixers[wheelEid];
    default:
      return 0;
  }
};

const clearSlot = (wheelEid: number, slot: number): void => {
  switch (slot) {
    case 0:
      ConstructionWheelComponent.slot0Excavators[wheelEid] = 0;
      ConstructionWheelComponent.slot0ConcreteMixers[wheelEid] = 0;
      break;
    case 1:
      ConstructionWheelComponent.slot1Excavators[wheelEid] = 0;
      ConstructionWheelComponent.slot1ConcreteMixers[wheelEid] = 0;
      break;
    case 2:
      ConstructionWheelComponent.slot2Excavators[wheelEid] = 0;
      ConstructionWheelComponent.slot2ConcreteMixers[wheelEid] = 0;
      break;
    case 3:
      ConstructionWheelComponent.slot3Excavators[wheelEid] = 0;
      ConstructionWheelComponent.slot3ConcreteMixers[wheelEid] = 0;
      break;
    case 4:
      ConstructionWheelComponent.slot4Excavators[wheelEid] = 0;
      ConstructionWheelComponent.slot4ConcreteMixers[wheelEid] = 0;
      break;
    case 5:
      ConstructionWheelComponent.slot5Excavators[wheelEid] = 0;
      ConstructionWheelComponent.slot5ConcreteMixers[wheelEid] = 0;
      break;
  }
};

export const ConstructionWheelSystem = (world: IWorld): ConstructionWheelRelease => {
  const wheelEids = constructionWheelQuery(world);
  const playerEids = playerResourceQuery(world);
  const wheelEid = wheelEids[0];
  const playerResourceEid = playerEids[0];

  if (wheelEid === undefined || playerResourceEid === undefined) {
    return {
      excavators: 0,
      concreteMixers: 0,
      activeSlot: 0,
    };
  }

  const nextActiveSlot =
    (ConstructionWheelComponent.activeSlot[wheelEid] + 1) %
    CONSTRUCTION_WHEEL_SLOT_COUNT;
  const releasedExcavators = getSlotExcavators(wheelEid, nextActiveSlot);
  const releasedConcreteMixers = getSlotConcreteMixers(wheelEid, nextActiveSlot);

  PlayerResourceComponent.excavators[playerResourceEid] += releasedExcavators;
  PlayerResourceComponent.concreteMixers[playerResourceEid] += releasedConcreteMixers;
  clearSlot(wheelEid, nextActiveSlot);
  ConstructionWheelComponent.activeSlot[wheelEid] = nextActiveSlot;

  return {
    excavators: releasedExcavators,
    concreteMixers: releasedConcreteMixers,
    activeSlot: nextActiveSlot,
  };
};
