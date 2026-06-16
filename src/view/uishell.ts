import type { InfrastructureBuildType } from '../core/commands/buildCommands';
import type { LevelDefinition, LevelObjectives } from '../core/levels';
import type { WeatherState } from '../core/types';
import type { BasinRenderCell } from './renderer';

export interface ResourceHudSnapshot {
  readonly credits: number;
  readonly reservoirWaterCubicMeters: number;
  readonly lastNetIncomeCredits: number;
  readonly engineers: number;
  readonly excavators: number;
  readonly concreteMixers: number;
}

export interface SimulationHudSnapshot {
  readonly weather: WeatherState;
  readonly turn: number;
  readonly totalWaterDepthMeters: number;
  readonly maxWaterDepthMeters: number;
  readonly maxFlowCubicMetersPerSecond: number;
  readonly phase: unknown;
  readonly mode: InteractionMode;
  readonly queuedBuildCount: number;
  readonly interactionLocked: boolean;
  readonly turnResolutionProgress: number;
  readonly turnResolutionLabel: string;
  readonly turnResolutionDetail: string;
  readonly pendingBuilds: readonly PendingBuildHudItem[];
  readonly pendingBuildCost: ResourceHudSnapshot;
  readonly resources: ResourceHudSnapshot;
  readonly objectives: LevelObjectives;
  readonly objectiveProgress: ObjectiveProgressSnapshot;
}

export type InteractionMode = 'build' | 'addTile';

export interface PendingBuildHudItem {
  readonly id: string;
  readonly label: string;
  readonly targetLabel: string;
  readonly costLabel: string;
}

export interface BuildOptionHudSnapshot {
  readonly buildType: InfrastructureBuildType;
  readonly label: string;
  readonly costLabel: string;
  readonly disabled: boolean;
  readonly reason?: string;
}

export interface BuildMenuSnapshot {
  readonly q: number;
  readonly r: number;
  readonly elevationMeters: number;
  readonly waterDepthMeters: number;
  readonly structureLabel: string;
  readonly options: Readonly<Record<InfrastructureBuildType, BuildOptionHudSnapshot>>;
}

export interface ObjectiveProgressSnapshot {
  readonly turn: number;
  readonly credits: number;
  readonly reservoirWaterCubicMeters: number;
  readonly hydropowerScore: number;
  readonly irrigationScore: number;
  readonly sustainabilityScore: number;
  readonly cumulativeNetIncomeCredits: number;
  readonly builtBaseDams: number;
  readonly builtElevationDamLevels: number;
  readonly builtConduits: number;
  readonly builtPowerhouses: number;
}

export interface UIShellCallbacks {
  readonly onSandboxSelected: () => void;
  readonly onLevelSelected: (levelId: string) => void;
  readonly onBuildSelected: (buildType: InfrastructureBuildType) => void;
  readonly onCancelBuildCommand: (commandId: string) => void;
  readonly onAddTileDirectionSelected: (direction: number) => void;
  readonly onToggleAddTileMode: () => void;
  readonly onCommitPlan: () => void;
  readonly onReset: () => void;
  readonly onStormPulse: () => void;
  readonly onMenuRequested: () => void;
  readonly onRetryLevel: () => void;
  readonly onOutcomeMenuRequested: () => void;
}

const requireElement = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`HydroStrategist could not find ${selector}.`);
  }

  return element;
};

const formatWeather = (weather: WeatherState): string =>
  weather
    .replace(/[A-Z]/g, (letter) => ` ${letter}`)
    .replace(/^./, (letter) => letter.toUpperCase());

const formatPhase = (phase: unknown): string =>
  String(phase).replace(/[A-Z]/g, (letter) => ` ${letter}`);

export class UIShell {
  private readonly mainMenu = requireElement<HTMLElement>('#mainMenu');
  private readonly hudPanel = requireElement<HTMLElement>('.hud');
  private readonly taskPanel = requireElement<HTMLElement>('.task-panel');
  private readonly sandboxModeButton =
    requireElement<HTMLButtonElement>('#sandboxModeButton');
  private readonly levelButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-level-id]'),
  );
  public readonly viewport = requireElement<HTMLElement>('#viewport');
  private readonly weatherLabel = requireElement<HTMLElement>('#weatherLabel');
  private readonly waterLabel = requireElement<HTMLElement>('#waterLabel');
  private readonly depthLabel = requireElement<HTMLElement>('#depthLabel');
  private readonly flowLabel = requireElement<HTMLElement>('#flowLabel');
  private readonly creditsLabel = requireElement<HTMLElement>('#creditsLabel');
  private readonly reservoirLabel = requireElement<HTMLElement>('#reservoirLabel');
  private readonly incomeLabel = requireElement<HTMLElement>('#incomeLabel');
  private readonly engineersLabel = requireElement<HTMLElement>('#engineersLabel');
  private readonly excavatorsLabel = requireElement<HTMLElement>('#excavatorsLabel');
  private readonly mixersLabel = requireElement<HTMLElement>('#mixersLabel');
  private readonly phaseLabel = requireElement<HTMLElement>('#phaseLabel');
  private readonly modeLabel = requireElement<HTMLElement>('#modeLabel');
  private readonly queueLabel = requireElement<HTMLElement>('#queueLabel');
  private readonly messageLabel = requireElement<HTMLElement>('#messageLabel');
  private readonly pendingBuildList =
    requireElement<HTMLOListElement>('#pendingBuildList');
  private readonly planCostLabel = requireElement<HTMLElement>('#planCostLabel');
  private readonly turnRunner = requireElement<HTMLElement>('#turnRunner');
  private readonly runnerPhaseLabel =
    requireElement<HTMLElement>('#runnerPhaseLabel');
  private readonly runnerPercentLabel =
    requireElement<HTMLElement>('#runnerPercentLabel');
  private readonly runnerProgressBar =
    requireElement<HTMLElement>('#runnerProgressBar');
  private readonly runnerDetailLabel =
    requireElement<HTMLElement>('#runnerDetailLabel');
  private readonly eventLog = requireElement<HTMLOListElement>('#eventLog');
  private readonly stormButton = requireElement<HTMLButtonElement>('#stormButton');
  private readonly resetButton = requireElement<HTMLButtonElement>('#resetButton');
  private readonly menuButton = requireElement<HTMLButtonElement>('#menuButton');
  private readonly addTileModeButton =
    requireElement<HTMLButtonElement>('#addTileModeButton');
  private readonly commitPlanButton =
    requireElement<HTMLButtonElement>('#commitPlanButton');
  private readonly buildOverlay = requireElement<HTMLElement>('#buildOverlay');
  private readonly selectedCellLabel = requireElement<HTMLElement>('#selectedCellLabel');
  private readonly selectedCellDetails =
    requireElement<HTMLElement>('#selectedCellDetails');
  private readonly closeBuildOverlayButton = requireElement<HTMLButtonElement>(
    '#closeBuildOverlayButton',
  );
  private readonly buildBaseDamButton =
    requireElement<HTMLButtonElement>('#buildBaseDamButton');
  private readonly buildElevationDamButton = requireElement<HTMLButtonElement>(
    '#buildElevationDamButton',
  );
  private readonly buildConduitButton =
    requireElement<HTMLButtonElement>('#buildConduitButton');
  private readonly buildPowerhouseButton = requireElement<HTMLButtonElement>(
    '#buildPowerhouseButton',
  );
  private readonly addTileOverlay = requireElement<HTMLElement>('#addTileOverlay');
  private readonly addTileCellLabel = requireElement<HTMLElement>('#addTileCellLabel');
  private readonly closeAddTileOverlayButton = requireElement<HTMLButtonElement>(
    '#closeAddTileOverlayButton',
  );
  private readonly addTileDirectionButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-add-direction]'),
  );
  private readonly levelTitle = requireElement<HTMLElement>('#levelTitle');
  private readonly levelDescription = requireElement<HTMLElement>('#levelDescription');
  private readonly objectiveList = requireElement<HTMLUListElement>('#objectiveList');
  private readonly outcomeOverlay = requireElement<HTMLElement>('#outcomeOverlay');
  private readonly outcomePanel = requireElement<HTMLElement>('.outcome-panel');
  private readonly outcomeEyebrow = requireElement<HTMLElement>('#outcomeEyebrow');
  private readonly outcomeTitle = requireElement<HTMLElement>('#outcomeTitle');
  private readonly outcomeMessage = requireElement<HTMLElement>('#outcomeMessage');
  private readonly retryLevelButton =
    requireElement<HTMLButtonElement>('#retryLevelButton');
  private readonly outcomeMenuButton =
    requireElement<HTMLButtonElement>('#outcomeMenuButton');
  private interactionLocked = false;
  private readonly buildOptionBlocked: Record<InfrastructureBuildType, boolean> = {
    baseDam: false,
    elevationDam: false,
    conduit: false,
    powerhouse: false,
  };

  public constructor(callbacks: UIShellCallbacks) {
    this.sandboxModeButton.addEventListener('click', callbacks.onSandboxSelected);
    for (const button of this.levelButtons) {
      button.addEventListener('click', () => {
        const levelId = button.dataset.levelId;

        if (levelId) {
          callbacks.onLevelSelected(levelId);
        }
      });
    }
    this.stormButton.addEventListener('click', callbacks.onStormPulse);
    this.resetButton.addEventListener('click', callbacks.onReset);
    this.menuButton.addEventListener('click', callbacks.onMenuRequested);
    this.retryLevelButton.addEventListener('click', callbacks.onRetryLevel);
    this.outcomeMenuButton.addEventListener(
      'click',
      callbacks.onOutcomeMenuRequested,
    );
    this.addTileModeButton.addEventListener('click', callbacks.onToggleAddTileMode);
    this.commitPlanButton.addEventListener('click', callbacks.onCommitPlan);
    this.pendingBuildList.addEventListener('click', (event) => {
      const target = event.target;

      if (!(target instanceof HTMLButtonElement)) {
        return;
      }

      const commandId = target.dataset.cancelCommandId;

      if (commandId) {
        callbacks.onCancelBuildCommand(commandId);
      }
    });
    this.closeBuildOverlayButton.addEventListener('click', () => this.hideBuildMenu());
    this.closeAddTileOverlayButton.addEventListener('click', () =>
      this.hideAddTileMenu(),
    );
    for (const button of this.addTileDirectionButtons) {
      button.addEventListener('click', () => {
        const direction = Number(button.dataset.addDirection);
        callbacks.onAddTileDirectionSelected(direction);
      });
    }
    this.buildBaseDamButton.addEventListener('click', () =>
      callbacks.onBuildSelected('baseDam'),
    );
    this.buildElevationDamButton.addEventListener('click', () =>
      callbacks.onBuildSelected('elevationDam'),
    );
    this.buildConduitButton.addEventListener('click', () =>
      callbacks.onBuildSelected('conduit'),
    );
    this.buildPowerhouseButton.addEventListener('click', () =>
      callbacks.onBuildSelected('powerhouse'),
    );
  }

  public updateHud(snapshot: SimulationHudSnapshot): void {
    this.weatherLabel.textContent = formatWeather(snapshot.weather);
    this.waterLabel.textContent = `${snapshot.totalWaterDepthMeters.toFixed(2)} m`;
    this.depthLabel.textContent = `${snapshot.maxWaterDepthMeters.toFixed(2)} m`;
    this.flowLabel.textContent = `${snapshot.maxFlowCubicMetersPerSecond.toFixed(2)} m3/s`;
    this.creditsLabel.textContent = `${snapshot.resources.credits}`;
    this.reservoirLabel.textContent = `${Math.round(
      snapshot.resources.reservoirWaterCubicMeters,
    )} m3`;
    this.incomeLabel.textContent =
      snapshot.resources.lastNetIncomeCredits >= 0
        ? `+${snapshot.resources.lastNetIncomeCredits}`
        : `${snapshot.resources.lastNetIncomeCredits}`;
    this.engineersLabel.textContent = `${snapshot.resources.engineers}`;
    this.excavatorsLabel.textContent = `${snapshot.resources.excavators}`;
    this.mixersLabel.textContent = `${snapshot.resources.concreteMixers}`;
    this.phaseLabel.textContent = `Turn ${snapshot.turn} - Phase: ${formatPhase(snapshot.phase)}`;
    this.modeLabel.textContent = `Mode: ${snapshot.mode === 'build' ? 'Build' : 'Add Tile'}`;
    this.addTileModeButton.classList.toggle('is-active', snapshot.mode === 'addTile');
    this.queueLabel.textContent = `Queued builds: ${snapshot.queuedBuildCount}`;
    this.commitPlanButton.textContent = snapshot.interactionLocked
      ? 'Resolving Turn'
      : `Commit Turn ${snapshot.turn}`;
    this.renderPendingBuilds(
      snapshot.pendingBuilds,
      snapshot.pendingBuildCost,
      snapshot.interactionLocked,
    );
    this.updateInteractionLock(snapshot.interactionLocked);
    this.updateTurnRunner(snapshot);
    this.renderObjectives(snapshot.objectives, snapshot.objectiveProgress);
  }

  public setMessage(message: string): void {
    this.messageLabel.textContent = message;
  }

  public showBuildMenu(
    menu: BuildMenuSnapshot,
    pointer: { readonly x: number; readonly y: number },
  ): void {
    this.selectedCellLabel.textContent = `Cell q${menu.q}, r${menu.r}`;
    this.selectedCellDetails.textContent = [
      `Elev ${menu.elevationMeters.toFixed(2)} m`,
      `Water ${menu.waterDepthMeters.toFixed(2)} m`,
      menu.structureLabel,
    ].join(' | ');
    this.applyBuildOption(this.buildBaseDamButton, menu.options.baseDam);
    this.applyBuildOption(
      this.buildElevationDamButton,
      menu.options.elevationDam,
    );
    this.applyBuildOption(this.buildConduitButton, menu.options.conduit);
    this.applyBuildOption(this.buildPowerhouseButton, menu.options.powerhouse);
    this.buildOverlay.style.left = `${Math.min(pointer.x, window.innerWidth - 250)}px`;
    this.buildOverlay.style.top = `${Math.min(pointer.y, window.innerHeight - 230)}px`;
    this.buildOverlay.hidden = false;
  }

  public hideBuildMenu(): void {
    this.buildOverlay.hidden = true;
  }

  public showAddTileMenu(
    cell: BasinRenderCell,
    pointer: { readonly x: number; readonly y: number },
  ): void {
    this.addTileCellLabel.textContent = `Expand from q${cell.q}, r${cell.r}`;
    this.addTileOverlay.style.left = `${Math.min(pointer.x, window.innerWidth - 250)}px`;
    this.addTileOverlay.style.top = `${Math.min(pointer.y, window.innerHeight - 280)}px`;
    this.addTileOverlay.hidden = false;
  }

  public hideAddTileMenu(): void {
    this.addTileOverlay.hidden = true;
  }

  public showMainMenu(): void {
    this.mainMenu.hidden = false;
  }

  public hideMainMenu(): void {
    this.mainMenu.hidden = true;
  }

  public showOutcome(
    title: string,
    message: string,
    state: 'complete' | 'failed',
  ): void {
    this.outcomeEyebrow.textContent = state === 'complete' ? 'Level Complete' : 'Game Over';
    this.outcomeTitle.textContent = title;
    this.outcomeMessage.textContent = message;
    this.outcomePanel.classList.toggle('is-failed', state === 'failed');
    this.outcomeOverlay.hidden = false;
  }

  public hideOutcome(): void {
    this.outcomeOverlay.hidden = true;
  }

  public setLevel(level: LevelDefinition): void {
    this.levelTitle.textContent = level.title;
    this.levelDescription.textContent = level.description;
  }

  public addEvent(message: string): void {
    const item = document.createElement('li');
    item.textContent = message;
    this.eventLog.prepend(item);

    while (this.eventLog.children.length > 8) {
      this.eventLog.lastElementChild?.remove();
    }
  }

  private renderObjectives(
    objectives: LevelObjectives,
    progress: ObjectiveProgressSnapshot,
  ): void {
    this.objectiveList.replaceChildren();
    this.appendObjective(
      `Deadline Turn ${progress.turn}/${objectives.maxTurns}`,
      progress.turn <= objectives.maxTurns,
    );

    if (objectives.minCredits !== undefined) {
      this.appendObjective(
        `Credits ${progress.credits}/${objectives.minCredits}`,
        progress.credits >= objectives.minCredits,
      );
    }

    if (objectives.minCumulativeNetIncomeCredits !== undefined) {
      this.appendObjective(
        `Cumulative Net Income ${progress.cumulativeNetIncomeCredits}/${objectives.minCumulativeNetIncomeCredits}`,
        progress.cumulativeNetIncomeCredits >=
          objectives.minCumulativeNetIncomeCredits,
      );
    }

    if (objectives.minBuiltBaseDams !== undefined) {
      this.appendObjective(
        `Build Base Dams ${progress.builtBaseDams}/${objectives.minBuiltBaseDams}`,
        progress.builtBaseDams >= objectives.minBuiltBaseDams,
      );
    }

    if (objectives.minBuiltElevationDamLevels !== undefined) {
      this.appendObjective(
        `Build Dam Elevations ${progress.builtElevationDamLevels}/${objectives.minBuiltElevationDamLevels}`,
        progress.builtElevationDamLevels >= objectives.minBuiltElevationDamLevels,
      );
    }

    if (objectives.minBuiltConduits !== undefined) {
      this.appendObjective(
        `Build Conduits ${progress.builtConduits}/${objectives.minBuiltConduits}`,
        progress.builtConduits >= objectives.minBuiltConduits,
      );
    }

    if (objectives.minBuiltPowerhouses !== undefined) {
      this.appendObjective(
        `Build Powerhouses ${progress.builtPowerhouses}/${objectives.minBuiltPowerhouses}`,
        progress.builtPowerhouses >= objectives.minBuiltPowerhouses,
      );
    }

    if (objectives.minReservoirWaterCubicMeters !== undefined) {
      this.appendObjective(
        `Reservoir ${Math.round(progress.reservoirWaterCubicMeters)}/${objectives.minReservoirWaterCubicMeters} m3`,
        progress.reservoirWaterCubicMeters >= objectives.minReservoirWaterCubicMeters,
      );
    }

    if (objectives.minHydropowerScore !== undefined) {
      this.appendObjective(
        `Hydropower ${Math.round(progress.hydropowerScore)}/${objectives.minHydropowerScore}`,
        progress.hydropowerScore >= objectives.minHydropowerScore,
      );
    }

    if (objectives.minIrrigationScore !== undefined) {
      this.appendObjective(
        `Irrigation ${Math.round(progress.irrigationScore)}/${objectives.minIrrigationScore}`,
        progress.irrigationScore >= objectives.minIrrigationScore,
      );
    }

    if (objectives.minSustainabilityScore !== undefined) {
      this.appendObjective(
        `Sustainability ${Math.round(progress.sustainabilityScore)}/${objectives.minSustainabilityScore}`,
        progress.sustainabilityScore >= objectives.minSustainabilityScore,
      );
    }
  }

  private appendObjective(label: string, complete: boolean): void {
    const item = document.createElement('li');
    item.textContent = complete ? `${label} [done]` : label;
    item.classList.toggle('is-complete', complete);
    this.objectiveList.appendChild(item);
  }

  private renderPendingBuilds(
    builds: readonly PendingBuildHudItem[],
    cost: ResourceHudSnapshot,
    locked: boolean,
  ): void {
    this.pendingBuildList.replaceChildren();

    if (builds.length === 0) {
      const item = document.createElement('li');
      item.className = 'empty-plan';
      item.textContent = 'No build orders queued';
      this.pendingBuildList.appendChild(item);
    } else {
      for (const build of builds) {
        const item = document.createElement('li');
        const text = document.createElement('span');
        const cancelButton = document.createElement('button');

        text.textContent = `${build.label} at ${build.targetLabel} (${build.costLabel})`;
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancel';
        cancelButton.dataset.cancelCommandId = build.id;
        cancelButton.disabled = locked;
        item.append(text, cancelButton);
        this.pendingBuildList.appendChild(item);
      }
    }

    this.planCostLabel.textContent = `Plan cost: ${cost.credits} cr, ${cost.engineers} eng, ${cost.excavators} exc, ${cost.concreteMixers} mix`;
  }

  private applyBuildOption(
    button: HTMLButtonElement,
    option: BuildOptionHudSnapshot,
  ): void {
    this.buildOptionBlocked[option.buildType] = option.disabled;
    button.textContent = `${option.label} - ${option.costLabel}`;
    button.title = option.reason ?? '';
    this.updateBuildButtonDisabledState();
  }

  private updateBuildButtonDisabledState(): void {
    this.buildBaseDamButton.disabled =
      this.interactionLocked || this.buildOptionBlocked.baseDam;
    this.buildElevationDamButton.disabled =
      this.interactionLocked || this.buildOptionBlocked.elevationDam;
    this.buildConduitButton.disabled =
      this.interactionLocked || this.buildOptionBlocked.conduit;
    this.buildPowerhouseButton.disabled =
      this.interactionLocked || this.buildOptionBlocked.powerhouse;
  }

  private updateInteractionLock(locked: boolean): void {
    this.interactionLocked = locked;
    this.hudPanel.classList.toggle('is-locked', locked);
    this.taskPanel.classList.toggle('is-locked', locked);
    this.buildOverlay.classList.toggle('is-locked', locked);
    this.addTileOverlay.classList.toggle('is-locked', locked);

    const lockableButtons = [
      this.stormButton,
      this.resetButton,
      this.menuButton,
      this.addTileModeButton,
      this.commitPlanButton,
      this.closeBuildOverlayButton,
      this.closeAddTileOverlayButton,
      ...this.addTileDirectionButtons,
    ];

    for (const button of lockableButtons) {
      button.disabled = locked;
    }

    this.updateBuildButtonDisabledState();
  }

  private updateTurnRunner(snapshot: SimulationHudSnapshot): void {
    const progress = Math.min(1, Math.max(0, snapshot.turnResolutionProgress));

    this.turnRunner.hidden = !snapshot.interactionLocked;
    this.runnerPhaseLabel.textContent = snapshot.turnResolutionLabel;
    this.runnerPercentLabel.textContent = `${Math.round(progress * 100)}%`;
    this.runnerProgressBar.style.width = `${Math.round(progress * 100)}%`;
    this.runnerDetailLabel.textContent = snapshot.turnResolutionDetail;
  }
}
