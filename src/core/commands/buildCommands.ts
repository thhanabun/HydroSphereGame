import { addComponent, hasComponent, type IWorld } from 'bitecs';

import {
  ConstructionWheelComponent,
  PlayerResourceComponent,
  StructureComponent,
  StructureKind,
  type StructureKindCode,
} from '../ecs/components';

export type InfrastructureBuildType = 'baseDam' | 'elevationDam' | 'conduit' | 'powerhouse';

export interface BuildCommandContext {
  readonly world: IWorld;
  readonly playerResourceEid: number;
  readonly constructionWheelEid: number;
}

export interface BuildCommandResult {
  readonly ok: boolean;
  readonly message: string;
  readonly targetCellEid: number;
  readonly buildType?: InfrastructureBuildType;
}

export interface InfrastructureCost {
  readonly credits: number;
  readonly engineers: number;
  readonly excavators: number;
  readonly concreteMixers: number;
  readonly buildTurns: number;
  readonly dischargeCapacity: number;
  readonly damHeight: number;
  readonly maxWaterDepth: number;
}

export interface BuildCommand {
  readonly targetCellEid: number;
  readonly buildType: InfrastructureBuildType;
  execute(context: BuildCommandContext): BuildCommandResult;
}

export const CONSTRUCTION_WHEEL_SLOT_COUNT = 6;

export const INFRASTRUCTURE_COSTS: Readonly<
  Record<InfrastructureBuildType, InfrastructureCost>
> = {
  baseDam: {
    credits: 220,
    engineers: 1,
    excavators: 1,
    concreteMixers: 1,
    buildTurns: 2,
    dischargeCapacity: 0.22,
    damHeight: 0.55,
    maxWaterDepth: 0.55,
  },
  elevationDam: {
    credits: 160,
    engineers: 1,
    excavators: 1,
    concreteMixers: 1,
    buildTurns: 1,
    dischargeCapacity: 0.18,
    damHeight: 0.38,
    maxWaterDepth: 0.38,
  },
  conduit: {
    credits: 140,
    engineers: 1,
    excavators: 1,
    concreteMixers: 0,
    buildTurns: 1,
    dischargeCapacity: 0.34,
    damHeight: 0,
    maxWaterDepth: 0,
  },
  powerhouse: {
    credits: 260,
    engineers: 1,
    excavators: 0,
    concreteMixers: 1,
    buildTurns: 3,
    dischargeCapacity: 0.3,
    damHeight: 0,
    maxWaterDepth: 0,
  },
};

const BUILD_TYPE_TO_STRUCTURE_KIND: Readonly<
  Record<InfrastructureBuildType, StructureKindCode>
> = {
  baseDam: StructureKind.baseDam,
  elevationDam: StructureKind.elevationDam,
  conduit: StructureKind.conduit,
  powerhouse: StructureKind.powerhouse,
};

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

const setSlotLocks = (
  wheelEid: number,
  slot: number,
  excavators: number,
  concreteMixers: number,
): void => {
  switch (slot) {
    case 0:
      ConstructionWheelComponent.slot0Excavators[wheelEid] = excavators;
      ConstructionWheelComponent.slot0ConcreteMixers[wheelEid] = concreteMixers;
      break;
    case 1:
      ConstructionWheelComponent.slot1Excavators[wheelEid] = excavators;
      ConstructionWheelComponent.slot1ConcreteMixers[wheelEid] = concreteMixers;
      break;
    case 2:
      ConstructionWheelComponent.slot2Excavators[wheelEid] = excavators;
      ConstructionWheelComponent.slot2ConcreteMixers[wheelEid] = concreteMixers;
      break;
    case 3:
      ConstructionWheelComponent.slot3Excavators[wheelEid] = excavators;
      ConstructionWheelComponent.slot3ConcreteMixers[wheelEid] = concreteMixers;
      break;
    case 4:
      ConstructionWheelComponent.slot4Excavators[wheelEid] = excavators;
      ConstructionWheelComponent.slot4ConcreteMixers[wheelEid] = concreteMixers;
      break;
    case 5:
      ConstructionWheelComponent.slot5Excavators[wheelEid] = excavators;
      ConstructionWheelComponent.slot5ConcreteMixers[wheelEid] = concreteMixers;
      break;
  }
};

const lockMachinery = (
  wheelEid: number,
  buildTurns: number,
  excavators: number,
  concreteMixers: number,
): void => {
  const activeSlot = ConstructionWheelComponent.activeSlot[wheelEid] % CONSTRUCTION_WHEEL_SLOT_COUNT;
  const releaseSlot = (activeSlot + buildTurns) % CONSTRUCTION_WHEEL_SLOT_COUNT;
  const nextExcavators = getSlotExcavators(wheelEid, releaseSlot) + excavators;
  const nextConcreteMixers =
    getSlotConcreteMixers(wheelEid, releaseSlot) + concreteMixers;

  setSlotLocks(wheelEid, releaseSlot, nextExcavators, nextConcreteMixers);
};

const hasEnoughResources = (
  playerResourceEid: number,
  cost: InfrastructureCost,
): boolean =>
  PlayerResourceComponent.credits[playerResourceEid] >= cost.credits &&
  PlayerResourceComponent.engineers[playerResourceEid] >= cost.engineers &&
  PlayerResourceComponent.excavators[playerResourceEid] >= cost.excavators &&
  PlayerResourceComponent.concreteMixers[playerResourceEid] >= cost.concreteMixers;

const isDamStructureKind = (structureType: number): boolean =>
  structureType === StructureKind.baseDam ||
  structureType === StructureKind.elevationDam;

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

export class BuildInfrastructureCommand implements BuildCommand {
  public constructor(
    public readonly targetCellEid: number,
    public readonly buildType: InfrastructureBuildType,
  ) {}

  public execute(context: BuildCommandContext): BuildCommandResult {
    const cost = INFRASTRUCTURE_COSTS[this.buildType];

    if (!hasEnoughResources(context.playerResourceEid, cost)) {
      return {
        ok: false,
        message: 'Insufficient resources for construction.',
        targetCellEid: this.targetCellEid,
        buildType: this.buildType,
      };
    }

    const hasStructureComponent = hasComponent(
      context.world,
      StructureComponent,
      this.targetCellEid,
    );
    const structureType = hasStructureComponent
      ? StructureComponent.type[this.targetCellEid]
      : StructureKind.none;

    if (this.buildType === 'elevationDam' && !isDamStructureKind(structureType)) {
      return {
        ok: false,
        message: 'Elevation requires an existing dam.',
        targetCellEid: this.targetCellEid,
        buildType: this.buildType,
      };
    }

    if (this.buildType !== 'elevationDam' && structureType !== StructureKind.none) {
      return {
        ok: false,
        message: 'This cell already contains infrastructure.',
        targetCellEid: this.targetCellEid,
        buildType: this.buildType,
      };
    }

    if (
      hasStructureComponent &&
      StructureComponent.constructionTurnsRemaining[this.targetCellEid] > 0
    ) {
      return {
        ok: false,
        message: 'This cell already has construction in progress.',
        targetCellEid: this.targetCellEid,
        buildType: this.buildType,
      };
    }

    if (!hasStructureComponent) {
      addComponent(context.world, StructureComponent, this.targetCellEid);
      StructureComponent.type[this.targetCellEid] = StructureKind.none;
      StructureComponent.level[this.targetCellEid] = 0;
      StructureComponent.active[this.targetCellEid] = 0;
      clearPendingConstruction(this.targetCellEid);
    }

    PlayerResourceComponent.credits[context.playerResourceEid] -= cost.credits;
    PlayerResourceComponent.engineers[context.playerResourceEid] -= cost.engineers;
    PlayerResourceComponent.excavators[context.playerResourceEid] -= cost.excavators;
    PlayerResourceComponent.concreteMixers[context.playerResourceEid] -=
      cost.concreteMixers;

    lockMachinery(
      context.constructionWheelEid,
      cost.buildTurns,
      cost.excavators,
      cost.concreteMixers,
    );

    StructureComponent.pendingType[this.targetCellEid] =
      BUILD_TYPE_TO_STRUCTURE_KIND[this.buildType];
    StructureComponent.pendingDischargeCapacity[this.targetCellEid] =
      cost.dischargeCapacity;
    StructureComponent.pendingDamHeight[this.targetCellEid] = cost.damHeight;
    StructureComponent.pendingMaxWaterDepth[this.targetCellEid] = cost.maxWaterDepth;
    StructureComponent.pendingEfficiency[this.targetCellEid] =
      this.buildType === 'powerhouse' ? 0.78 : 0;
    StructureComponent.pendingGateOpening[this.targetCellEid] =
      this.buildType === 'conduit' || this.buildType === 'powerhouse' ? 1 : 0.25;
    StructureComponent.constructionTurnsRemaining[this.targetCellEid] =
      cost.buildTurns;
    StructureComponent.constructionTotalTurns[this.targetCellEid] = cost.buildTurns;
    StructureComponent.constructionProgress[this.targetCellEid] = 0;

    return {
      ok: true,
      message: `Construction started; ${cost.buildTurns} turn(s) remaining.`,
      targetCellEid: this.targetCellEid,
      buildType: this.buildType,
    };
  }
}

export const createBuildCommand = (
  targetCellEid: number,
  buildType: InfrastructureBuildType,
): BuildCommand => new BuildInfrastructureCommand(targetCellEid, buildType);
