export type EntityId = number;
export type CellId = number;
export type TurnNumber = number;

export interface HexCoords {
  readonly q: number;
  readonly r: number;
  readonly s: number;
}

export interface AxialHexCoords {
  readonly q: number;
  readonly r: number;
}

export type NeighborDirection = 0 | 1 | 2 | 3 | 4 | 5;

export type Season = 'dry' | 'monsoon';

export type WeatherState = 'sunny' | 'cloudy' | 'lightRain' | 'heavyRain' | 'storm';

export type BiomeType =
  | 'wetland'
  | 'riparianForest'
  | 'grassland'
  | 'rainfedFarm'
  | 'irrigatedFarm'
  | 'settlement'
  | 'barren';

export type SoilType =
  | 'sand'
  | 'loamySand'
  | 'sandyLoam'
  | 'loam'
  | 'siltLoam'
  | 'clayLoam'
  | 'siltyClay'
  | 'clay'
  | 'urban';

export type StructureType =
  | 'dam'
  | 'levee'
  | 'conduit'
  | 'powerhouse'
  | 'irrigationCanal'
  | 'navigationLock'
  | 'wetlandRestoration'
  | 'rainGauge';

export type WorkerActionType =
  | 'survey'
  | 'terraform'
  | 'build'
  | 'upgrade'
  | 'operate'
  | 'restoreBiome'
  | 'decommission';

export interface GridCell {
  readonly id: CellId;
  readonly coords: HexCoords;
  readonly elevationMeters: number;
  readonly waterDepthMeters: number;
  readonly soilType: SoilType;
  readonly biomeType: BiomeType;
  readonly curveNumber: number;
  readonly saturatedHydraulicConductivityMetersPerSecond: number;
  readonly wettingFrontSuctionHeadMeters: number;
  readonly initialSoilMoistureDeficit: number;
  readonly infiltrationVolumeMeters: number;
  readonly structureId?: EntityId;
}

export interface EnvironmentalRequirements {
  readonly minWaterDepthMeters: number;
  readonly maxWaterDepthMeters: number;
  readonly minSoilMoisture: number;
  readonly maxSoilMoisture: number;
  readonly droughtToleranceTurns: number;
  readonly floodToleranceTurns: number;
}

export interface WorkerAction {
  readonly id: string;
  readonly type: WorkerActionType;
  readonly workerId: EntityId;
  readonly targetCellId: CellId;
  readonly issuedTurn: TurnNumber;
  readonly structureType?: StructureType;
  readonly terraformElevationDeltaMeters?: number;
  readonly priority?: number;
}

export interface ConstructionWheelTask {
  readonly id: string;
  readonly action: WorkerAction;
  readonly startedTurn: TurnNumber;
  readonly remainingTurns: number;
  readonly totalTurns: number;
}

export interface CompletedConstructionTask extends ConstructionWheelTask {
  readonly completedTurn: TurnNumber;
}

export interface BasinBenefitScores {
  readonly hydropower: number;
  readonly floodControl: number;
  readonly irrigation: number;
  readonly navigation: number;
  readonly sustainability: number;
}

export interface WeatherSample {
  readonly state: WeatherState;
  readonly season: Season;
  readonly precipitationMeters: number;
  readonly evapotranspirationMeters: number;
}

export interface MarkovWeatherModel {
  readonly season: Season;
  readonly states: readonly WeatherState[];
  readonly transitionMatrix: readonly (readonly number[])[];
}

export interface SimulationConstants {
  readonly gravityMetersPerSecondSquared: number;
  readonly cellWidthMeters: number;
  readonly cellHeightMeters: number;
  readonly pipeCrossSectionAreaMetersSquared: number;
  readonly pipeLengthMeters: number;
  readonly timeStepSeconds: number;
  readonly infiltrationEtaMeters: number;
}
