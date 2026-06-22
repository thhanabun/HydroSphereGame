import { SurfaceKind, type SurfaceKindCode, StructureKind } from './ecs/components';
import type { WeatherState } from './types';

export interface BasinCellSeed {
  readonly q: number;
  readonly r: number;
  readonly elevation: number;
  readonly waterDepth: number;
  readonly curveNumber: number;
  readonly structureType: number;
  readonly damHeight: number;
  readonly maxWaterDepth: number;
  readonly sourceDepthPerTurn?: number;
  readonly surfaceType?: SurfaceKindCode;
}

export interface LevelObjectives {
  readonly minResolvedTurns?: number;
  readonly minCredits?: number;
  readonly minReservoirWaterCubicMeters?: number;
  readonly minHydropowerScore?: number;
  readonly minIrrigationScore?: number;
  readonly minSustainabilityScore?: number;
  readonly minBuiltBaseDams?: number;
  readonly minBuiltElevationDamLevels?: number;
  readonly minBuiltConduits?: number;
  readonly minBuiltPowerhouses?: number;
  readonly minCumulativeNetIncomeCredits?: number;
  readonly maxTurns: number;
}

export interface ResourceLoadout {
  readonly credits: number;
  readonly engineers: number;
  readonly excavators: number;
  readonly concreteMixers: number;
}

export interface LevelDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly hint?: string;
  readonly weatherScript?: readonly WeatherState[];
  readonly seed: readonly BasinCellSeed[];
  readonly resources: ResourceLoadout;
  readonly objectives: LevelObjectives;
  readonly allowGridExpansion: boolean;
}

export const SANDBOX_LEVEL: LevelDefinition = {
  id: 'sandbox',
  title: 'Sandbox Basin',
  description: 'Open-ended basin management with grid expansion enabled.',
  hint: 'Experiment freely. Build orders only resolve when you commit the turn.',
  allowGridExpansion: true,
  resources: {
    credits: 900,
    engineers: 4,
    excavators: 3,
    concreteMixers: 3,
  },
  objectives: {
    maxTurns: 999,
  },
  seed: [
    {
      q: 0,
      r: 0,
      elevation: 0.15,
      waterDepth: 0.28,
      curveNumber: 72,
      structureType: StructureKind.baseDam,
      damHeight: 0.55,
      maxWaterDepth: 0.55,
      surfaceType: SurfaceKind.water,
    },
    {
      q: 1,
      r: 0,
      elevation: 0.4,
      waterDepth: 0.08,
      curveNumber: 68,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.shore,
    },
    {
      q: 1,
      r: -1,
      elevation: 0.95,
      waterDepth: 0.04,
      curveNumber: 61,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      sourceDepthPerTurn: 0.05,
      surfaceType: SurfaceKind.water,
    },
    {
      q: 0,
      r: -1,
      elevation: 1.25,
      waterDepth: 0.03,
      curveNumber: 58,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      sourceDepthPerTurn: 0.08,
      surfaceType: SurfaceKind.water,
    },
    {
      q: -1,
      r: 0,
      elevation: 0.8,
      waterDepth: 0.05,
      curveNumber: 64,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.land,
    },
    {
      q: -1,
      r: 1,
      elevation: 0.3,
      waterDepth: 0.12,
      curveNumber: 76,
      structureType: StructureKind.powerhouse,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.shore,
    },
    {
      q: 0,
      r: 1,
      elevation: -0.15,
      waterDepth: 0.46,
      curveNumber: 82,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.water,
    },
    {
      q: 2,
      r: 0,
      elevation: 0.58,
      waterDepth: 0.025,
      curveNumber: 68,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.land,
    },
    {
      q: 2,
      r: -1,
      elevation: 0.72,
      waterDepth: 0.04,
      curveNumber: 66,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.shore,
    },
    {
      q: 2,
      r: -2,
      elevation: 1.18,
      waterDepth: 0.025,
      curveNumber: 62,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.land,
    },
    {
      q: 1,
      r: -2,
      elevation: 1.35,
      waterDepth: 0.025,
      curveNumber: 60,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.land,
    },
    {
      q: 0,
      r: -2,
      elevation: 1.55,
      waterDepth: 0.035,
      curveNumber: 57,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.water,
    },
    {
      q: -1,
      r: -1,
      elevation: 1.12,
      waterDepth: 0.025,
      curveNumber: 63,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.land,
    },
    {
      q: -2,
      r: 0,
      elevation: 1,
      waterDepth: 0.025,
      curveNumber: 65,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.land,
    },
    {
      q: -2,
      r: 1,
      elevation: 0.55,
      waterDepth: 0.04,
      curveNumber: 71,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.shore,
    },
    {
      q: -2,
      r: 2,
      elevation: 0.12,
      waterDepth: 0.04,
      curveNumber: 74,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.shore,
    },
    {
      q: -1,
      r: 2,
      elevation: -0.02,
      waterDepth: 0.04,
      curveNumber: 79,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.shore,
    },
    {
      q: 0,
      r: 2,
      elevation: -0.3,
      waterDepth: 0.34,
      curveNumber: 84,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.water,
    },
    {
      q: 1,
      r: 1,
      elevation: -0.08,
      waterDepth: 0.04,
      curveNumber: 81,
      structureType: StructureKind.none,
      damHeight: 0,
      maxWaterDepth: 0,
      surfaceType: SurfaceKind.shore,
    },
  ],
};

const withoutInfrastructure = (
  seed: readonly BasinCellSeed[],
): readonly BasinCellSeed[] =>
  seed.map((cell) => ({
    ...cell,
    structureType: StructureKind.none,
    damHeight: 0,
    maxWaterDepth: 0,
  }));

const withoutStructureType = (
  seed: readonly BasinCellSeed[],
  structureType: number,
): readonly BasinCellSeed[] =>
  seed.map((cell) =>
    cell.structureType === structureType
      ? {
          ...cell,
          structureType: StructureKind.none,
          damHeight: 0,
          maxWaterDepth: 0,
        }
      : cell,
  );

const LARGE_BASIN_DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

const TWIN_RIVER_CELLS = new Set([
  '-2,-1',
  '-1,-1',
  '-1,0',
  '0,0',
  '0,1',
  '0,2',
  '0,3',
  '2,-2',
  '1,-1',
  '1,0',
]);

const createLargeBasinSeed = (
  layout: 'twinRivers' | 'greatRiver',
): readonly BasinCellSeed[] => {
  const coordinates: { readonly q: number; readonly r: number }[] = [];

  for (let q = -3; q <= 3; q += 1) {
    const minR = Math.max(-3, -q - 3);
    const maxR = Math.min(3, -q + 3);

    for (let r = minR; r <= maxR; r += 1) {
      coordinates.push({ q, r });
    }
  }

  const isWaterCell = (q: number, r: number): boolean =>
    layout === 'twinRivers'
      ? TWIN_RIVER_CELLS.has(`${q},${r}`)
      : q === 0 || q === -1;

  return coordinates.map(({ q, r }) => {
    const waterCell = isWaterCell(q, r);
    const shoreCell =
      !waterCell &&
      LARGE_BASIN_DIRECTIONS.some(([dq, dr]) => isWaterCell(q + dq, r + dr));
    const structureType =
      q === 0 && r === 0
        ? StructureKind.baseDam
        : layout === 'twinRivers' && q === -1 && r === 1
          ? StructureKind.powerhouse
          : StructureKind.none;
    const sourceCell =
      layout === 'twinRivers'
        ? (q === -2 && r === -1) || (q === 2 && r === -2)
        : (q === 0 && r === -3) || (q === -1 && r === -2);
    const surfaceType = waterCell
      ? SurfaceKind.water
      : shoreCell
        ? SurfaceKind.shore
        : SurfaceKind.land;

    return {
      q,
      r,
      elevation: 1.25 - (r + 3) * 0.18 + Math.abs(q) * 0.04,
      waterDepth: waterCell ? 0.28 + Math.max(0, r) * 0.035 : shoreCell ? 0.055 : 0.025,
      curveNumber: waterCell ? 80 : shoreCell ? 74 : 66,
      structureType,
      damHeight: structureType === StructureKind.baseDam ? 0.65 : 0,
      maxWaterDepth: structureType === StructureKind.baseDam ? 0.65 : 0,
      sourceDepthPerTurn: sourceCell ? 0.08 : 0,
      surfaceType,
    };
  });
};

const TWIN_RIVERS_LEVEL_SEED = createLargeBasinSeed('twinRivers');
const GREAT_RIVER_LEVEL_SEED = createLargeBasinSeed('greatRiver');

export const CAMPAIGN_LEVELS: readonly LevelDefinition[] = [
  {
    id: 'level-1',
    title: '1. First Reservoir',
    description: 'Build your first water reserve without running out of credits.',
    hint: 'Weather is fixed in campaign. Build one Base Dam on the wet low cell q0, r0, then keep the water reserve stable through turn 3.',
    weatherScript: ['sunny', 'cloudy', 'lightRain', 'cloudy', 'sunny'],
    allowGridExpansion: false,
    resources: { credits: 620, engineers: 3, excavators: 2, concreteMixers: 2 },
    objectives: {
      minResolvedTurns: 3,
      minBuiltBaseDams: 1,
      minReservoirWaterCubicMeters: 80,
      minCredits: 300,
      maxTurns: 5,
    },
    seed: withoutInfrastructure(SANDBOX_LEVEL.seed).map((cell) =>
      cell.q === 0 && cell.r === 0
        ? {
            ...cell,
            waterDepth: 0.42,
          }
        : cell,
    ),
  },
  {
    id: 'level-2',
    title: '2. Turbine Contract',
    description: 'Turn stored flow into hydropower revenue.',
    hint: 'Build a Powerhouse next to the existing dam, such as q-1, r1, so it can use the dam head as a turbine intake. Reservoir storage alone does not create hydropower credits.',
    weatherScript: ['cloudy', 'lightRain', 'cloudy', 'lightRain', 'sunny', 'cloudy'],
    allowGridExpansion: false,
    resources: { credits: 760, engineers: 4, excavators: 2, concreteMixers: 3 },
    objectives: {
      minBuiltPowerhouses: 1,
      minHydropowerScore: 30,
      minCumulativeNetIncomeCredits: 55,
      minCredits: 350,
      maxTurns: 6,
    },
    seed: withoutStructureType(SANDBOX_LEVEL.seed, StructureKind.powerhouse),
  },
  {
    id: 'level-3',
    title: '3. Irrigation Plain',
    description: 'Keep enough shallow water available for farms.',
    hint: 'Use a Conduit on Shore tiles such as q1, r1 or q1, r0 to supply adjacent damp cells. Irrigation likes shallow water, and conduit-supported cells can stay productive at lower depth.',
    weatherScript: ['cloudy', 'lightRain', 'sunny', 'cloudy', 'lightRain', 'sunny'],
    allowGridExpansion: true,
    resources: { credits: 700, engineers: 4, excavators: 3, concreteMixers: 2 },
    objectives: {
      minBuiltConduits: 1,
      minIrrigationScore: 50,
      minCumulativeNetIncomeCredits: 72,
      minCredits: 280,
      maxTurns: 6,
    },
    seed: SANDBOX_LEVEL.seed,
  },
  {
    id: 'level-4',
    title: '4. Flood Season',
    description: 'Survive monsoon water while preserving sustainability.',
    hint: 'Elevate the dam, then survive both heavy-rain turns through resolved turn 4 while keeping water controlled and sustainability above target.',
    weatherScript: ['lightRain', 'heavyRain', 'cloudy', 'heavyRain', 'lightRain', 'cloudy'],
    allowGridExpansion: true,
    resources: { credits: 840, engineers: 4, excavators: 3, concreteMixers: 3 },
    objectives: {
      minResolvedTurns: 4,
      minBuiltElevationDamLevels: 1,
      minReservoirWaterCubicMeters: 350,
      minSustainabilityScore: 70,
      minCredits: 300,
      maxTurns: 6,
    },
    seed: SANDBOX_LEVEL.seed.map((cell) => ({
      ...cell,
      waterDepth: cell.waterDepth + 0.18,
    })),
  },
  {
    id: 'level-5',
    title: '5. Balanced Basin',
    description: 'Earn credits while balancing hydropower, irrigation, and ecosystem stability.',
    hint: 'Build a Powerhouse on the Shore tile q1, r0 next to the dam, then add a Conduit on q-2, r1 or another Shore tile for irrigation support.',
    weatherScript: [
      'cloudy',
      'lightRain',
      'sunny',
      'heavyRain',
      'cloudy',
      'lightRain',
      'sunny',
      'cloudy',
    ],
    allowGridExpansion: true,
    resources: { credits: 980, engineers: 5, excavators: 4, concreteMixers: 4 },
    objectives: {
      minBuiltConduits: 1,
      minBuiltPowerhouses: 1,
      minHydropowerScore: 35,
      minIrrigationScore: 55,
      minSustainabilityScore: 65,
      minCumulativeNetIncomeCredits: 100,
      minCredits: 600,
      maxTurns: 8,
    },
    seed: SANDBOX_LEVEL.seed,
  },
  {
    id: 'level-6',
    title: '6. Twin Tributaries',
    description: 'Manage two headwater branches that merge into one shared basin.',
    hint: 'Build Conduits on Shore tiles q-2, r0 and q2, r-1 to distribute both tributaries before they merge.',
    weatherScript: [
      'cloudy',
      'lightRain',
      'cloudy',
      'heavyRain',
      'sunny',
      'lightRain',
      'cloudy',
      'sunny',
    ],
    allowGridExpansion: false,
    resources: { credits: 1100, engineers: 5, excavators: 4, concreteMixers: 3 },
    objectives: {
      minResolvedTurns: 4,
      minBuiltConduits: 2,
      minReservoirWaterCubicMeters: 300,
      minIrrigationScore: 70,
      minCumulativeNetIncomeCredits: 120,
      minSustainabilityScore: 65,
      minCredits: 450,
      maxTurns: 8,
    },
    seed: TWIN_RIVERS_LEVEL_SEED,
  },
  {
    id: 'level-7',
    title: '7. Great River',
    description: 'Control a broad river carrying regional-scale water volume.',
    hint: 'Elevate the central dam at q0, r0 and build a Powerhouse on the Shore tile q1, r0 before peak flow arrives.',
    weatherScript: [
      'cloudy',
      'lightRain',
      'heavyRain',
      'cloudy',
      'heavyRain',
      'lightRain',
      'sunny',
      'cloudy',
      'sunny',
    ],
    allowGridExpansion: false,
    resources: { credits: 1300, engineers: 6, excavators: 4, concreteMixers: 5 },
    objectives: {
      minResolvedTurns: 5,
      minBuiltElevationDamLevels: 1,
      minBuiltPowerhouses: 1,
      minReservoirWaterCubicMeters: 600,
      minHydropowerScore: 50,
      minSustainabilityScore: 60,
      minCredits: 500,
      maxTurns: 9,
    },
    seed: GREAT_RIVER_LEVEL_SEED,
  },
];
