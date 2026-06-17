import { assign, setup } from 'xstate';

import type {
  BuildCommandResult,
  InfrastructureBuildType,
} from '../commands/buildCommands';
import type {
  BasinBenefitScores,
  CompletedConstructionTask,
  ConstructionWheelTask,
  Season,
  TurnNumber,
  WeatherSample,
  WorkerAction,
} from '../types';

export type GamePhase =
  | 'weatherPhase'
  | 'planningPhase'
  | 'commandExecutionPhase'
  | 'simulationPhase'
  | 'evaluationPhase';

export interface EcosystemFeedback {
  readonly cellId: number;
  readonly biomeBefore: string;
  readonly biomeAfter: string;
  readonly reason: 'drought' | 'overFlooding' | 'recovery';
  readonly sustainabilityDelta: number;
}

export interface GameContext {
  readonly turn: TurnNumber;
  readonly season: Season;
  readonly currentWeather: WeatherSample;
  readonly previousWeather?: WeatherSample;
  readonly pendingWorkerActions: readonly WorkerAction[];
  readonly pendingBuildCommands: readonly BuildCommandRequest[];
  readonly commandResults: readonly BuildCommandResult[];
  readonly constructionWheel: readonly ConstructionWheelTask[];
  readonly readyConstructionTasks: readonly CompletedConstructionTask[];
  readonly completedConstructionTasks: readonly CompletedConstructionTask[];
  readonly simulationTicksPerTurn: number;
  readonly simulationTicksRemaining: number;
  readonly simulationTickIndex: number;
  readonly maxWorkerActionsPerTurn: number;
  readonly scores: BasinBenefitScores;
  readonly ecosystemFeedback: readonly EcosystemFeedback[];
}

export interface BuildCommandRequest {
  readonly id: string;
  readonly targetCellEid: number;
  readonly buildType: InfrastructureBuildType;
  readonly issuedTurn: TurnNumber;
}

export interface GameMachineInput {
  readonly startingTurnIndex?: TurnNumber;
  readonly startingSeason?: Season;
  readonly startingWeather?: WeatherSample;
  readonly simulationTicksPerTurn?: number;
  readonly maxWorkerActionsPerTurn?: number;
  readonly startingScores?: BasinBenefitScores;
}

export type GameEvent =
  | { readonly type: 'WEATHER_RESOLVED'; readonly weather: WeatherSample }
  | { readonly type: 'QUEUE_WORKER_ACTION'; readonly action: WorkerAction }
  | { readonly type: 'QUEUE_BUILD_COMMAND'; readonly command: BuildCommandRequest }
  | { readonly type: 'CLEAR_BUILD_COMMANDS' }
  | { readonly type: 'CANCEL_BUILD_COMMAND'; readonly commandId: string }
  | { readonly type: 'CANCEL_WORKER_ACTION'; readonly actionId: string }
  | { readonly type: 'CLEAR_WORKER_ACTIONS' }
  | { readonly type: 'COMMIT_PLANNING' }
  | {
      readonly type: 'COMMANDS_EXECUTED';
      readonly results: readonly BuildCommandResult[];
    }
  | { readonly type: 'SIMULATION_TICKED' }
  | { readonly type: 'SIMULATION_BATCH_TICKED'; readonly ticksCompleted: number }
  | { readonly type: 'SIMULATION_COMPLETE' }
  | {
      readonly type: 'EVALUATION_COMPLETE';
      readonly scores: BasinBenefitScores;
      readonly ecosystemFeedback: readonly EcosystemFeedback[];
    }
  | { readonly type: 'RESET'; readonly input?: GameMachineInput };

const DEFAULT_SCORES: BasinBenefitScores = {
  hydropower: 0,
  floodControl: 0,
  irrigation: 0,
  navigation: 0,
  sustainability: 100,
};

const DEFAULT_WEATHER: WeatherSample = {
  state: 'sunny',
  season: 'dry',
  precipitationMeters: 0,
  evapotranspirationMeters: 0.004,
};

const createInitialContext = (input: GameMachineInput = {}): GameContext => {
  const startingWeather = input.startingWeather ?? DEFAULT_WEATHER;

  return {
    turn: input.startingTurnIndex ?? 1,
    season: input.startingSeason ?? startingWeather.season,
    currentWeather: startingWeather,
    previousWeather: undefined,
    pendingWorkerActions: [],
    pendingBuildCommands: [],
    commandResults: [],
    constructionWheel: [],
    readyConstructionTasks: [],
    completedConstructionTasks: [],
    simulationTicksPerTurn: input.simulationTicksPerTurn ?? 96,
    simulationTicksRemaining: 0,
    simulationTickIndex: 0,
    maxWorkerActionsPerTurn: input.maxWorkerActionsPerTurn ?? 4,
    scores: input.startingScores ?? DEFAULT_SCORES,
    ecosystemFeedback: [],
  };
};

const estimateConstructionTurns = (action: WorkerAction): number => {
  if (action.type === 'survey' || action.type === 'operate') {
    return 0;
  }

  if (action.type === 'terraform') {
    const elevationDelta = Math.abs(action.terraformElevationDeltaMeters ?? 0);
    return Math.max(1, Math.ceil(elevationDelta / 0.5));
  }

  switch (action.structureType) {
    case 'dam':
      return 4;
    case 'powerhouse':
      return 4;
    case 'navigationLock':
      return 3;
    case 'conduit':
    case 'irrigationCanal':
      return 2;
    case 'levee':
    case 'wetlandRestoration':
      return 2;
    case 'rainGauge':
      return 1;
    default:
      return 1;
  }
};

const toConstructionTask = (
  action: WorkerAction,
  startedTurn: TurnNumber,
): ConstructionWheelTask | undefined => {
  const totalTurns = estimateConstructionTurns(action);

  if (totalTurns <= 0) {
    return undefined;
  }

  return {
    id: `task:${action.id}`,
    action,
    startedTurn,
    remainingTurns: totalTurns,
    totalTurns,
  };
};

const clampWholeTicks = (ticks: number): number => Math.max(0, Math.floor(ticks));

export const hydroStrategistGameMachine = setup({
  types: {
    context: {} as GameContext,
    events: {} as GameEvent,
    input: {} as GameMachineInput,
  },
  guards: {
    canQueueWorkerAction: ({ context, event }) => {
      if (event.type !== 'QUEUE_WORKER_ACTION') {
        return false;
      }

      const alreadyQueued = context.pendingWorkerActions.some(
        (action) => action.id === event.action.id,
      );

      return (
        !alreadyQueued &&
        context.pendingWorkerActions.length < context.maxWorkerActionsPerTurn
      );
    },
    canQueueBuildCommand: ({ context, event }) => {
      if (event.type !== 'QUEUE_BUILD_COMMAND') {
        return false;
      }

      const alreadyQueued = context.pendingBuildCommands.some(
        (command) => command.id === event.command.id,
      );

      return (
        !alreadyQueued &&
        context.pendingBuildCommands.length < context.maxWorkerActionsPerTurn
      );
    },
    hasTicksAfterSingleStep: ({ context }) => context.simulationTicksRemaining > 1,
    hasTicksAfterBatch: ({ context, event }) => {
      if (event.type !== 'SIMULATION_BATCH_TICKED') {
        return false;
      }

      return context.simulationTicksRemaining - clampWholeTicks(event.ticksCompleted) > 0;
    },
  },
  actions: {
    advanceTurn: assign(({ context }) => ({
      turn: context.turn + 1,
      readyConstructionTasks: [],
      ecosystemFeedback: [],
    })),
    advanceConstructionWheel: assign(({ context }) => {
      const activeTasks: ConstructionWheelTask[] = [];
      const completedTasks: CompletedConstructionTask[] = [];

      for (const task of context.constructionWheel) {
        const remainingTurns = Math.max(0, task.remainingTurns - 1);

        if (remainingTurns === 0) {
          completedTasks.push({
            ...task,
            remainingTurns,
            completedTurn: context.turn,
          });
        } else {
          activeTasks.push({
            ...task,
            remainingTurns,
          });
        }
      }

      return {
        constructionWheel: activeTasks,
        readyConstructionTasks: completedTasks,
        completedConstructionTasks: [
          ...context.completedConstructionTasks,
          ...completedTasks,
        ],
      };
    }),
    setWeather: assign(({ context, event }) => {
      if (event.type !== 'WEATHER_RESOLVED') {
        return {};
      }

      return {
        previousWeather: context.currentWeather,
        currentWeather: event.weather,
        season: event.weather.season,
      };
    }),
    queueWorkerAction: assign(({ context, event }) => {
      if (event.type !== 'QUEUE_WORKER_ACTION') {
        return {};
      }

      const actions = [...context.pendingWorkerActions, event.action].sort(
        (left, right) => (right.priority ?? 0) - (left.priority ?? 0),
      );

      return {
        pendingWorkerActions: actions,
      };
    }),
    queueBuildCommand: assign(({ context, event }) => {
      if (event.type !== 'QUEUE_BUILD_COMMAND') {
        return {};
      }

      return {
        pendingBuildCommands: [...context.pendingBuildCommands, event.command],
      };
    }),
    cancelBuildCommand: assign(({ context, event }) => {
      if (event.type !== 'CANCEL_BUILD_COMMAND') {
        return {};
      }

      return {
        pendingBuildCommands: context.pendingBuildCommands.filter(
          (command) => command.id !== event.commandId,
        ),
      };
    }),
    clearBuildCommands: assign({
      pendingBuildCommands: [],
    }),
    cancelWorkerAction: assign(({ context, event }) => {
      if (event.type !== 'CANCEL_WORKER_ACTION') {
        return {};
      }

      return {
        pendingWorkerActions: context.pendingWorkerActions.filter(
          (action) => action.id !== event.actionId,
        ),
      };
    }),
    clearWorkerActions: assign({
      pendingWorkerActions: [],
    }),
    scheduleConstructionTasks: assign(({ context }) => {
      const scheduledTasks = context.pendingWorkerActions
        .map((action) => toConstructionTask(action, context.turn))
        .filter((task): task is ConstructionWheelTask => task !== undefined);

      return {
        constructionWheel: [...context.constructionWheel, ...scheduledTasks],
        pendingWorkerActions: [],
      };
    }),
    recordCommandResults: assign(({ event }) => {
      if (event.type !== 'COMMANDS_EXECUTED') {
        return {};
      }

      return {
        commandResults: event.results,
        pendingBuildCommands: [],
      };
    }),
    startSimulation: assign(({ context }) => ({
      simulationTicksRemaining: context.simulationTicksPerTurn,
      simulationTickIndex: 0,
    })),
    recordSingleSimulationTick: assign(({ context }) => ({
      simulationTicksRemaining: Math.max(0, context.simulationTicksRemaining - 1),
      simulationTickIndex: context.simulationTickIndex + 1,
    })),
    recordSimulationBatch: assign(({ context, event }) => {
      if (event.type !== 'SIMULATION_BATCH_TICKED') {
        return {};
      }

      const ticksCompleted = Math.min(
        context.simulationTicksRemaining,
        clampWholeTicks(event.ticksCompleted),
      );

      return {
        simulationTicksRemaining: context.simulationTicksRemaining - ticksCompleted,
        simulationTickIndex: context.simulationTickIndex + ticksCompleted,
      };
    }),
    completeSimulation: assign({
      simulationTicksRemaining: 0,
    }),
    applyEvaluation: assign(({ event }) => {
      if (event.type !== 'EVALUATION_COMPLETE') {
        return {};
      }

      return {
        scores: event.scores,
        ecosystemFeedback: event.ecosystemFeedback,
      };
    }),
    resetGame: assign(({ event }) => {
      if (event.type !== 'RESET') {
        return createInitialContext();
      }

      return createInitialContext(event.input);
    }),
  },
}).createMachine({
  id: 'hydroStrategistGame',
  initial: 'planningPhase',
  context: ({ input }) => createInitialContext(input),
  on: {
    RESET: {
      target: '.planningPhase',
      actions: 'resetGame',
    },
  },
  states: {
    weatherPhase: {
      on: {
        WEATHER_RESOLVED: {
          target: 'commandExecutionPhase',
          actions: 'setWeather',
        },
      },
    },
    planningPhase: {
      on: {
        QUEUE_WORKER_ACTION: {
          guard: 'canQueueWorkerAction',
          actions: 'queueWorkerAction',
        },
        QUEUE_BUILD_COMMAND: {
          guard: 'canQueueBuildCommand',
          actions: 'queueBuildCommand',
        },
        CANCEL_BUILD_COMMAND: {
          actions: 'cancelBuildCommand',
        },
        CLEAR_BUILD_COMMANDS: {
          actions: 'clearBuildCommands',
        },
        CANCEL_WORKER_ACTION: {
          actions: 'cancelWorkerAction',
        },
        CLEAR_WORKER_ACTIONS: {
          actions: 'clearWorkerActions',
        },
        COMMIT_PLANNING: {
          target: 'weatherPhase',
          actions: 'scheduleConstructionTasks',
        },
      },
    },
    commandExecutionPhase: {
      on: {
        COMMANDS_EXECUTED: {
          target: 'simulationPhase',
          actions: ['recordCommandResults', 'startSimulation'],
        },
      },
    },
    simulationPhase: {
      on: {
        SIMULATION_TICKED: [
          {
            guard: 'hasTicksAfterSingleStep',
            actions: 'recordSingleSimulationTick',
          },
          {
            target: 'evaluationPhase',
            actions: ['recordSingleSimulationTick', 'completeSimulation'],
          },
        ],
        SIMULATION_BATCH_TICKED: [
          {
            guard: 'hasTicksAfterBatch',
            actions: 'recordSimulationBatch',
          },
          {
            target: 'evaluationPhase',
            actions: ['recordSimulationBatch', 'completeSimulation'],
          },
        ],
        SIMULATION_COMPLETE: {
          target: 'evaluationPhase',
          actions: 'completeSimulation',
        },
      },
    },
    evaluationPhase: {
      on: {
        EVALUATION_COMPLETE: {
          target: 'planningPhase',
          actions: ['applyEvaluation', 'advanceConstructionWheel', 'advanceTurn'],
        },
      },
    },
  },
});

export type HydroStrategistGameMachine = typeof hydroStrategistGameMachine;
