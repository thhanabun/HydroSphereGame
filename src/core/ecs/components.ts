import { Types, defineComponent } from 'bitecs';

import type { BiomeType, SoilType, WeatherState } from '../types';

export const HEX_DIRECTION_COUNT = 6;
export const NO_NEIGHBOR = -1;

export const SoilCode = {
  sand: 0,
  loamySand: 1,
  sandyLoam: 2,
  loam: 3,
  siltLoam: 4,
  clayLoam: 5,
  siltyClay: 6,
  clay: 7,
  urban: 8,
} as const satisfies Record<SoilType, number>;

export const BiomeCode = {
  wetland: 0,
  riparianForest: 1,
  grassland: 2,
  rainfedFarm: 3,
  irrigatedFarm: 4,
  settlement: 5,
  barren: 6,
} as const satisfies Record<BiomeType, number>;

export const StructureCode = {
  none: 0,
  baseDam: 1,
  elevationDam: 2,
  conduit: 3,
  powerhouse: 4,
  dam: 1,
  levee: 2,
  irrigationCanal: 3,
  navigationLock: 3,
  wetlandRestoration: 0,
  rainGauge: 0,
} as const;

export const StructureKind = {
  none: 0,
  baseDam: 1,
  elevationDam: 2,
  conduit: 3,
  powerhouse: 4,
} as const;

export type StructureKindCode = (typeof StructureKind)[keyof typeof StructureKind];

export const SurfaceKind = {
  land: 0,
  shore: 1,
  water: 2,
} as const;

export type SurfaceKindCode = (typeof SurfaceKind)[keyof typeof SurfaceKind];

export const WeatherStateCode = {
  sunny: 0,
  cloudy: 1,
  lightRain: 2,
  heavyRain: 3,
  storm: 4,
} as const satisfies Record<WeatherState, number>;

export const Position = defineComponent({
  q: Types.i16,
  r: Types.i16,
  s: Types.i16,
  worldX: Types.f32,
  worldY: Types.f32,
  worldZ: Types.f32,
});

export const Terrain = defineComponent({
  elevation: Types.f32,
  cellWidth: Types.f32,
  cellHeight: Types.f32,
  roughness: Types.f32,
  curveNumber: Types.f32,
  soilType: Types.ui8,
  biomeType: Types.ui8,
  surfaceType: Types.ui8,
  active: Types.ui8,
});

export const Water = defineComponent({
  depth: Types.f32,
  previousDepth: Types.f32,
  hydraulicHead: Types.f32,
  precipitationRate: Types.f32,
  evapotranspirationRate: Types.f32,
  inflow: Types.f32,
  outflow: Types.f32,
  flow0: Types.f32,
  flow1: Types.f32,
  flow2: Types.f32,
  flow3: Types.f32,
  flow4: Types.f32,
  flow5: Types.f32,
});

export const WaterSource = defineComponent({
  active: Types.ui8,
  baseDepthPerTurn: Types.f32,
  lastDepthAdded: Types.f32,
});

export const Infiltration = defineComponent({
  saturatedHydraulicConductivity: Types.f32,
  wettingFrontSuctionHead: Types.f32,
  soilMoistureDeficit: Types.f32,
  cumulativeDepth: Types.f32,
  capacity: Types.f32,
  actualRate: Types.f32,
  surfaceDetentionDepth: Types.f32,
  accumulatedPrecipitation: Types.f32,
  scsRetention: Types.f32,
  scsRunoffDepth: Types.f32,
});

export const StructureComponent = defineComponent({
  type: Types.ui8,
  level: Types.ui8,
  active: Types.ui8,
  pendingType: Types.ui8,
  dischargeCapacity: Types.f32,
  damHeight: Types.f32,
  maxWaterDepth: Types.f32,
  constructionProgress: Types.f32,
  constructionTurnsRemaining: Types.ui8,
  constructionTotalTurns: Types.ui8,
  pendingDischargeCapacity: Types.f32,
  pendingDamHeight: Types.f32,
  pendingMaxWaterDepth: Types.f32,
  pendingEfficiency: Types.f32,
  pendingGateOpening: Types.f32,
  capacity: Types.f32,
  storageDepth: Types.f32,
  efficiency: Types.f32,
  gateOpening: Types.f32,
  conduitTarget: Types.i32,
});

export const PlayerResourceComponent = defineComponent({
  credits: Types.i32,
  engineers: Types.i16,
  excavators: Types.i16,
  concreteMixers: Types.i16,
  reservoirWater: Types.f32,
  lastGrossIncome: Types.i32,
  lastPenalty: Types.i32,
  lastNetIncome: Types.i32,
});

export const ConstructionWheelComponent = defineComponent({
  activeSlot: Types.ui8,
  slot0Excavators: Types.i16,
  slot0ConcreteMixers: Types.i16,
  slot1Excavators: Types.i16,
  slot1ConcreteMixers: Types.i16,
  slot2Excavators: Types.i16,
  slot2ConcreteMixers: Types.i16,
  slot3Excavators: Types.i16,
  slot3ConcreteMixers: Types.i16,
  slot4Excavators: Types.i16,
  slot4ConcreteMixers: Types.i16,
  slot5Excavators: Types.i16,
  slot5ConcreteMixers: Types.i16,
});

export const Structure = StructureComponent;

export type HydroComponent =
  | typeof Position
  | typeof Terrain
  | typeof Water
  | typeof WaterSource
  | typeof Infiltration
  | typeof StructureComponent
  | typeof PlayerResourceComponent
  | typeof ConstructionWheelComponent;

export const getFlow = (eid: number, direction: number): number => {
  switch (direction) {
    case 0:
      return Water.flow0[eid];
    case 1:
      return Water.flow1[eid];
    case 2:
      return Water.flow2[eid];
    case 3:
      return Water.flow3[eid];
    case 4:
      return Water.flow4[eid];
    case 5:
      return Water.flow5[eid];
    default:
      return 0;
  }
};

export const setFlow = (eid: number, direction: number, flow: number): void => {
  switch (direction) {
    case 0:
      Water.flow0[eid] = flow;
      break;
    case 1:
      Water.flow1[eid] = flow;
      break;
    case 2:
      Water.flow2[eid] = flow;
      break;
    case 3:
      Water.flow3[eid] = flow;
      break;
    case 4:
      Water.flow4[eid] = flow;
      break;
    case 5:
      Water.flow5[eid] = flow;
      break;
  }
};

export const oppositeDirection = (direction: number): number =>
  (direction + HEX_DIRECTION_COUNT / 2) % HEX_DIRECTION_COUNT;
