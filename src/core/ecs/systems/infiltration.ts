import { defineQuery, type IWorld } from 'bitecs';

import { Infiltration, Terrain, Water } from '../components';

export interface SoilInfiltrationSystemInput {
  readonly deltaTimeSeconds: number;
  readonly etaMeters: number;
  readonly includeEvapotranspiration?: boolean;
}

export interface ScsCurveNumberEvaluationInput {
  readonly resetAccumulatedPrecipitation?: boolean;
}

const infiltrationQuery = defineQuery([Terrain, Water, Infiltration]);

export const SoilInfiltrationSystem = (
  world: IWorld,
  input: SoilInfiltrationSystemInput,
): IWorld => {
  const deltaTimeSeconds = Math.max(0, input.deltaTimeSeconds);
  const etaMeters = Math.max(Number.EPSILON, input.etaMeters);
  const eids = infiltrationQuery(world);

  for (let index = 0; index < eids.length; index += 1) {
    const eid = eids[index];

    if (Terrain.active[eid] === 0) {
      continue;
    }

    const rainfallRate = Math.max(0, Water.precipitationRate[eid]);
    const evapotranspirationRate =
      input.includeEvapotranspiration === true
        ? Math.max(0, Water.evapotranspirationRate[eid])
        : 0;
    const surfaceWaterDepth = Math.max(0, Water.depth[eid]);
    const cumulativeInfiltrationDepth = Math.max(
      etaMeters,
      Infiltration.cumulativeDepth[eid],
    );
    const saturatedHydraulicConductivity = Math.max(
      0,
      Infiltration.saturatedHydraulicConductivity[eid],
    );
    const wettingFrontSuctionHead = Math.max(
      0,
      Infiltration.wettingFrontSuctionHead[eid],
    );
    const soilMoistureDeficit = Math.max(0, Infiltration.soilMoistureDeficit[eid]);
    const infiltrationCapacity =
      saturatedHydraulicConductivity *
      (1 +
        (wettingFrontSuctionHead * soilMoistureDeficit + surfaceWaterDepth) /
          cumulativeInfiltrationDepth);

    const surfaceLimitedInfiltration =
      rainfallRate >= infiltrationCapacity
        ? infiltrationCapacity
        : (surfaceWaterDepth * infiltrationCapacity) /
          Math.max(etaMeters, surfaceWaterDepth);

    const availableWaterRate =
      rainfallRate + surfaceWaterDepth / Math.max(Number.EPSILON, deltaTimeSeconds);
    const actualInfiltrationRate = Math.min(
      Math.max(0, surfaceLimitedInfiltration),
      availableWaterRate,
    );
    const netSurfaceRate =
      rainfallRate - actualInfiltrationRate - evapotranspirationRate;
    const nextDepth = Math.max(0, surfaceWaterDepth + netSurfaceRate * deltaTimeSeconds);
    const infiltratedDepth = actualInfiltrationRate * deltaTimeSeconds;

    Water.previousDepth[eid] = Water.depth[eid];
    Water.depth[eid] = nextDepth;
    Infiltration.capacity[eid] = infiltrationCapacity;
    Infiltration.actualRate[eid] = actualInfiltrationRate;
    Infiltration.surfaceDetentionDepth[eid] = nextDepth;
    Infiltration.cumulativeDepth[eid] += infiltratedDepth;
    Infiltration.accumulatedPrecipitation[eid] += rainfallRate * deltaTimeSeconds;
  }

  return world;
};

export const ScsCurveNumberEvaluationSystem = (
  world: IWorld,
  input: ScsCurveNumberEvaluationInput = {},
): IWorld => {
  const eids = infiltrationQuery(world);

  for (let index = 0; index < eids.length; index += 1) {
    const eid = eids[index];

    if (Terrain.active[eid] === 0) {
      continue;
    }

    const curveNumber = Math.min(100, Math.max(1, Terrain.curveNumber[eid]));
    const accumulatedPrecipitationMillimeters =
      Math.max(0, Infiltration.accumulatedPrecipitation[eid]) * 1000;
    const soilRetentionMillimeters = 25400 / curveNumber - 254;
    const initialAbstractionMillimeters = 0.05 * soilRetentionMillimeters;
    const runoffMillimeters =
      accumulatedPrecipitationMillimeters <= initialAbstractionMillimeters
        ? 0
        : ((accumulatedPrecipitationMillimeters - initialAbstractionMillimeters) *
            (accumulatedPrecipitationMillimeters - initialAbstractionMillimeters)) /
          (accumulatedPrecipitationMillimeters + 0.95 * soilRetentionMillimeters);

    Infiltration.scsRetention[eid] = soilRetentionMillimeters / 1000;
    Infiltration.scsRunoffDepth[eid] = runoffMillimeters / 1000;

    if (input.resetAccumulatedPrecipitation === true) {
      Infiltration.accumulatedPrecipitation[eid] = 0;
    }
  }

  return world;
};
