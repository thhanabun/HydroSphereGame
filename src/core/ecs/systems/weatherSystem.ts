import { defineQuery, type IWorld } from 'bitecs';

import type { Season, WeatherSample, WeatherState } from '../../types';
import { Terrain, Water, WeatherStateCode } from '../components';

export interface WeatherSystemInput {
  readonly season: Season;
  readonly currentState: WeatherState;
  readonly random01: number;
  readonly sampleDurationSeconds?: number;
}

export const WEATHER_STATES = [
  'sunny',
  'cloudy',
  'lightRain',
  'heavyRain',
  'storm',
] as const satisfies readonly WeatherState[];

export const DRY_SEASON_TRANSITION_MATRIX = [
  [0.72, 0.18, 0.07, 0.025, 0.005],
  [0.28, 0.48, 0.17, 0.06, 0.01],
  [0.16, 0.2, 0.42, 0.18, 0.04],
  [0.09, 0.13, 0.22, 0.42, 0.14],
  [0.08, 0.1, 0.17, 0.25, 0.4],
] as const;

export const MONSOON_SEASON_TRANSITION_MATRIX = [
  [0.42, 0.28, 0.18, 0.09, 0.03],
  [0.12, 0.48, 0.24, 0.12, 0.04],
  [0.05, 0.18, 0.5, 0.2, 0.07],
  [0.03, 0.09, 0.21, 0.49, 0.18],
  [0.02, 0.06, 0.14, 0.28, 0.5],
] as const;

const PRECIPITATION_RATE_BY_WEATHER: Readonly<Record<WeatherState, number>> = {
  sunny: 0,
  cloudy: 0,
  lightRain: 0.0000028,
  heavyRain: 0.0000139,
  storm: 0.0000278,
};

const EVAPOTRANSPIRATION_RATE_BY_WEATHER: Readonly<Record<WeatherState, number>> = {
  sunny: 0.00000007,
  cloudy: 0.000000045,
  lightRain: 0.000000025,
  heavyRain: 0.000000012,
  storm: 0.000000006,
};

const waterQuery = defineQuery([Terrain, Water]);

const clamp01 = (value: number): number => {
  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
};

const selectTransitionMatrix = (season: Season): readonly (readonly number[])[] =>
  season === 'monsoon'
    ? MONSOON_SEASON_TRANSITION_MATRIX
    : DRY_SEASON_TRANSITION_MATRIX;

const sampleNextWeatherState = (
  currentState: WeatherState,
  season: Season,
  random01: number,
): WeatherState => {
  const currentCode = WeatherStateCode[currentState];
  const matrix = selectTransitionMatrix(season);
  const fallbackRow = matrix[WeatherStateCode.sunny] as readonly number[];
  const row = matrix[currentCode] ?? fallbackRow;
  const sample = clamp01(random01);
  let cumulativeProbability = 0;

  for (let index = 0; index < row.length; index += 1) {
    cumulativeProbability += row[index] ?? 0;

    if (sample <= cumulativeProbability) {
      return WEATHER_STATES[index] ?? 'storm';
    }
  }

  return WEATHER_STATES[row.length - 1] ?? 'storm';
};

export const WeatherSystem = (
  world: IWorld,
  input: WeatherSystemInput,
): WeatherSample => {
  const nextState = sampleNextWeatherState(
    input.currentState,
    input.season,
    input.random01,
  );
  const precipitationRate = PRECIPITATION_RATE_BY_WEATHER[nextState];
  const evapotranspirationRate = EVAPOTRANSPIRATION_RATE_BY_WEATHER[nextState];
  const sampleDurationSeconds = Math.max(0, input.sampleDurationSeconds ?? 86400);
  const eids = waterQuery(world);

  for (let index = 0; index < eids.length; index += 1) {
    const eid = eids[index];

    Water.precipitationRate[eid] = precipitationRate;
    Water.evapotranspirationRate[eid] = evapotranspirationRate;
  }

  return {
    state: nextState,
    season: input.season,
    precipitationMeters: precipitationRate * sampleDurationSeconds,
    evapotranspirationMeters: evapotranspirationRate * sampleDurationSeconds,
  };
};
