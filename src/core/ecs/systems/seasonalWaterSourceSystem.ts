import { defineQuery, type IWorld } from 'bitecs';

import type { WeatherState } from '../../types';
import { Infiltration, Terrain, Water, WaterSource } from '../components';

export interface SeasonalWaterSourceSystemInput {
  readonly weather: WeatherState;
  readonly precipitationMeters: number;
  readonly evapotranspirationMeters: number;
}

export interface SeasonalWaterSourceReport {
  readonly runoffDepthMeters: number;
  readonly sourceDepthMeters: number;
  readonly evapotranspirationDepthMeters: number;
  readonly sourceCellCount: number;
}

const sourceHydrologyQuery = defineQuery([Terrain, Water, Infiltration, WaterSource]);

const WEATHER_SOURCE_MULTIPLIER: Readonly<Record<WeatherState, number>> = {
  sunny: 0.35,
  cloudy: 0.62,
  lightRain: 1,
  heavyRain: 1.35,
  storm: 1.7,
};

const calculateScsRunoffDepth = (precipitationMeters: number, curveNumber: number): number => {
  const precipitationMillimeters = Math.max(0, precipitationMeters) * 1000;
  const boundedCurveNumber = Math.min(100, Math.max(1, curveNumber));
  const soilRetentionMillimeters = 25400 / boundedCurveNumber - 254;
  const initialAbstractionMillimeters = 0.05 * soilRetentionMillimeters;

  if (precipitationMillimeters <= initialAbstractionMillimeters) {
    return 0;
  }

  const runoffMillimeters =
    ((precipitationMillimeters - initialAbstractionMillimeters) *
      (precipitationMillimeters - initialAbstractionMillimeters)) /
    (precipitationMillimeters + 0.95 * soilRetentionMillimeters);

  return runoffMillimeters / 1000;
};

export const SeasonalWaterSourceSystem = (
  world: IWorld,
  input: SeasonalWaterSourceSystemInput,
): SeasonalWaterSourceReport => {
  const eids = sourceHydrologyQuery(world);
  const sourceMultiplier = WEATHER_SOURCE_MULTIPLIER[input.weather];
  const evapotranspirationDepth = Math.max(0, input.evapotranspirationMeters);
  let totalRunoffDepth = 0;
  let totalSourceDepth = 0;
  let sourceCellCount = 0;

  for (let index = 0; index < eids.length; index += 1) {
    const eid = eids[index];

    if (Terrain.active[eid] === 0) {
      continue;
    }

    const runoffDepth = calculateScsRunoffDepth(
      input.precipitationMeters,
      Terrain.curveNumber[eid],
    );
    const sourceDepth =
      WaterSource.active[eid] === 1
        ? Math.max(0, WaterSource.baseDepthPerTurn[eid]) * sourceMultiplier
        : 0;
    const nextDepth = Math.max(
      0,
      Math.max(0, Water.depth[eid]) + runoffDepth + sourceDepth - evapotranspirationDepth,
    );

    Water.previousDepth[eid] = Water.depth[eid];
    Water.depth[eid] = nextDepth;
    WaterSource.lastDepthAdded[eid] = sourceDepth;
    Infiltration.scsRunoffDepth[eid] = runoffDepth;

    totalRunoffDepth += runoffDepth;
    totalSourceDepth += sourceDepth;

    if (sourceDepth > 0) {
      sourceCellCount += 1;
    }
  }

  return {
    runoffDepthMeters: totalRunoffDepth,
    sourceDepthMeters: totalSourceDepth,
    evapotranspirationDepthMeters: evapotranspirationDepth,
    sourceCellCount,
  };
};
