import { StructureKind } from './ecs/components';

export interface BasinCellSeed {
  readonly q: number;
  readonly r: number;
  readonly elevation: number;
  readonly waterDepth: number;
  readonly curveNumber: number;
  readonly structureType: number;
  readonly damHeight: number;
  readonly maxWaterDepth: number;
}

export interface LevelObjectives {
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
  readonly seed: readonly BasinCellSeed[];
  readonly resources: ResourceLoadout;
  readonly objectives: LevelObjectives;
  readonly allowGridExpansion: boolean;
}

export const SANDBOX_LEVEL: LevelDefinition = {
  id: 'sandbox',
  title: 'Sandbox Basin',
  description: 'Open-ended basin management with grid expansion enabled.',
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

export const CAMPAIGN_LEVELS: readonly LevelDefinition[] = [
  {
    id: 'level-1',
    title: '1. First Reservoir',
    description: 'Store enough water behind a dam without running out of credits.',
    allowGridExpansion: false,
    resources: { credits: 620, engineers: 3, excavators: 2, concreteMixers: 2 },
    objectives: {
      minBuiltBaseDams: 1,
      minReservoirWaterCubicMeters: 120,
      minCumulativeNetIncomeCredits: 48,
      minCredits: 250,
      maxTurns: 3,
    },
    seed: withoutInfrastructure(SANDBOX_LEVEL.seed.slice(0, 5)),
  },
  {
    id: 'level-2',
    title: '2. Turbine Contract',
    description: 'Turn stored flow into hydropower revenue.',
    allowGridExpansion: false,
    resources: { credits: 760, engineers: 4, excavators: 2, concreteMixers: 3 },
    objectives: {
      minBuiltPowerhouses: 1,
      minHydropowerScore: 30,
      minCumulativeNetIncomeCredits: 55,
      minCredits: 350,
      maxTurns: 3,
    },
    seed: [
      ...withoutStructureType(
        SANDBOX_LEVEL.seed.slice(0, 6),
        StructureKind.powerhouse,
      ),
      {
        q: -2,
        r: 2,
        elevation: 0.05,
        waterDepth: 0.16,
        curveNumber: 74,
        structureType: StructureKind.none,
        damHeight: 0,
        maxWaterDepth: 0,
      },
    ],
  },
  {
    id: 'level-3',
    title: '3. Irrigation Plain',
    description: 'Keep enough shallow water available for farms.',
    allowGridExpansion: true,
    resources: { credits: 700, engineers: 4, excavators: 3, concreteMixers: 2 },
    objectives: {
      minBuiltConduits: 1,
      minIrrigationScore: 50,
      minCumulativeNetIncomeCredits: 72,
      minCredits: 280,
      maxTurns: 3,
    },
    seed: [
      ...SANDBOX_LEVEL.seed,
      {
        q: 1,
        r: 1,
        elevation: -0.05,
        waterDepth: 0.2,
        curveNumber: 82,
        structureType: StructureKind.none,
        damHeight: 0,
        maxWaterDepth: 0,
      },
    ],
  },
  {
    id: 'level-4',
    title: '4. Flood Season',
    description: 'Survive monsoon water while preserving sustainability.',
    allowGridExpansion: true,
    resources: { credits: 840, engineers: 4, excavators: 3, concreteMixers: 3 },
    objectives: {
      minBuiltElevationDamLevels: 1,
      minSustainabilityScore: 70,
      minCumulativeNetIncomeCredits: 90,
      minCredits: 300,
      maxTurns: 3,
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
      maxTurns: 4,
    },
    seed: [
      ...SANDBOX_LEVEL.seed,
      {
        q: -2,
        r: 1,
        elevation: 0.2,
        waterDepth: 0.1,
        curveNumber: 73,
        structureType: StructureKind.none,
        damHeight: 0,
        maxWaterDepth: 0,
      },
      {
        q: 2,
        r: -1,
        elevation: 0.62,
        waterDepth: 0.06,
        curveNumber: 66,
        structureType: StructureKind.none,
        damHeight: 0,
        maxWaterDepth: 0,
      },
    ],
  },
];
