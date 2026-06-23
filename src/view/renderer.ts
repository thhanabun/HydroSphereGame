import { Orientation, defineHex } from 'honeycomb-grid';
import {
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';

import type { WeatherState } from '../core/types';
import {
  Structure,
  StructureCode,
  StructureKind,
  SurfaceKind,
  Terrain,
  Water,
  WaterSource,
} from '../core/ecs/components';

export interface BasinRenderCell {
  readonly eid: number;
  readonly q: number;
  readonly r: number;
}

export interface HydroRendererOptions {
  readonly cells: readonly BasinRenderCell[];
  readonly tileRadiusMeters: number;
  readonly maxCells?: number;
  readonly onCellSelected?: (
    cell: BasinRenderCell,
    pointer: { readonly x: number; readonly y: number },
  ) => void;
  readonly onCellDragged?: (
    cell: BasinRenderCell,
    direction: number,
    pointer: { readonly x: number; readonly y: number },
  ) => void;
  readonly onCellDropped?: (
    cell: BasinRenderCell,
    pointer: { readonly x: number; readonly y: number },
  ) => void;
  readonly onCellHovered?: (
    cell: BasinRenderCell | undefined,
    pointer: { readonly x: number; readonly y: number },
  ) => void;
  readonly canPreviewBuild?: (cell: BasinRenderCell, structureType: number) => boolean;
}

export interface HydroRendererPort {
  setCells(cells: readonly BasinRenderCell[]): void;
  setWeather(weather: WeatherState): void;
  setBuildPreview(structureType?: number): void;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  fitMap(): void;
  update(): void;
  start(): void;
  dispose(): void;
}

const LAND_LOW = new Color('#4f6e3f');
const LAND_HIGH = new Color('#8b7a4a');
const SHORE_LOW = new Color('#a08a56');
const SHORE_HIGH = new Color('#c5ab6a');
const CHANNEL_LOW = new Color('#2f9fe8');
const CHANNEL_HIGH = new Color('#0b3d91');
const HEADWATER_TINT = new Color('#63c7ff');
const DAM_COLOR = new Color('#d3ad67');
const ELEVATION_DAM_COLOR = new Color('#c8d0d8');
const CONDUIT_COLOR = new Color('#f0a14d');
const POWERHOUSE_COLOR = new Color('#f3efd8');
const CONSTRUCTION_COLOR = new Color('#f2d16b');
const INVALID_PREVIEW_COLOR = new Color('#ff4f5f');
const VALID_PREVIEW_COLOR = new Color('#78e6a8');
const SKY_BY_WEATHER: Readonly<Record<WeatherState, string>> = {
  sunny: '#123141',
  cloudy: '#182a31',
  lightRain: '#102936',
  heavyRain: '#0c202d',
  storm: '#091824',
};
const RenderHex = defineHex({
  dimensions: 1,
  orientation: Orientation.POINTY,
  origin: 'topLeft',
});

const RAIN_DROP_COUNT = 120;
const MIN_MAP_ZOOM = 0.48;
const MAX_MAP_ZOOM = 2.45;
const MAP_ZOOM_STEP = 1.18;

interface StructureVisual {
  readonly group: Group;
  readonly structureType: number;
  readonly underConstruction: boolean;
}

interface BuildPreviewMaterialState {
  readonly material: MeshBasicMaterial | MeshStandardMaterial;
  readonly color: Color;
  readonly opacity: number;
}

interface BuildPreview {
  readonly group: Group;
  readonly structureType: number;
  readonly materials: readonly BuildPreviewMaterialState[];
  cellEid?: number;
  valid?: boolean;
}

export class HydroRenderer implements HydroRendererPort {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly terrainMesh: InstancedMesh;
  private readonly basinGroup = new Group();
  private readonly structureLayer = new Group();
  private readonly rainMesh: InstancedMesh;
  private readonly ambientLight: AmbientLight;
  private readonly sunLight: DirectionalLight;
  private readonly fillLight: DirectionalLight;
  private cells: readonly BasinRenderCell[];
  private currentWeather: WeatherState = 'sunny';
  private readonly tileRadiusMeters: number;
  private readonly maxCells: number;
  private readonly onCellSelected?: HydroRendererOptions['onCellSelected'];
  private readonly onCellDragged?: HydroRendererOptions['onCellDragged'];
  private readonly onCellDropped?: HydroRendererOptions['onCellDropped'];
  private readonly onCellHovered?: HydroRendererOptions['onCellHovered'];
  private readonly canPreviewBuild?: HydroRendererOptions['canPreviewBuild'];
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private readonly displayedWaterDepths = new Map<number, number>();
  private readonly previousStructureTypes = new Map<number, number>();
  private readonly structurePulseUntil = new Map<number, number>();
  private readonly structureVisuals = new Map<number, StructureVisual>();
  private buildPreview?: BuildPreview;
  private readonly hiddenScale = new Vector3(0, 0, 0);
  private readonly raycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private readonly resizeObserver: ResizeObserver;
  private zoom = 1;
  private panX = 0;
  private panZ = 0;
  private panStart:
    | {
        readonly x: number;
        readonly y: number;
        readonly panX: number;
        readonly panZ: number;
        readonly pointerId: number;
      }
    | undefined;
  private hoveredCellEid: number | undefined;
  private dragStart:
    | {
        readonly cell: BasinRenderCell;
        readonly x: number;
        readonly y: number;
      }
    | undefined;
  private animationFrameId = 0;

  public constructor(container: HTMLElement, options: HydroRendererOptions) {
    this.cells = options.cells;
    this.tileRadiusMeters = options.tileRadiusMeters;
    this.maxCells = options.maxCells ?? Math.max(64, options.cells.length);
    this.onCellSelected = options.onCellSelected;
    this.onCellDragged = options.onCellDragged;
    this.onCellDropped = options.onCellDropped;
    this.onCellHovered = options.onCellHovered;
    this.canPreviewBuild = options.canPreviewBuild;
    this.scene = new Scene();
    this.scene.background = new Color(SKY_BY_WEATHER.sunny);
    this.camera = new PerspectiveCamera(48, 1, 0.1, 1000);
    this.camera.position.set(0, 11, 14);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'default' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    const terrainGeometry = new CylinderGeometry(
      this.tileRadiusMeters,
      this.tileRadiusMeters,
      0.42,
      6,
      1,
      false,
    );
    const terrainMaterial = new MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.82,
      metalness: 0.02,
    });

    const rainGeometry = new BoxGeometry(0.025, 1.25, 0.025);
    const rainMaterial = new MeshBasicMaterial({
      color: '#9bd8f2',
      transparent: true,
      opacity: 0.66,
    });

    this.terrainMesh = new InstancedMesh(terrainGeometry, terrainMaterial, this.maxCells);
    this.rainMesh = new InstancedMesh(rainGeometry, rainMaterial, RAIN_DROP_COUNT);
    this.terrainMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.rainMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.terrainMesh.count = this.cells.length;
    this.rainMesh.count = 0;

    this.basinGroup.add(this.terrainMesh, this.structureLayer);
    this.basinGroup.rotation.y = Math.PI / 6;
    this.scene.add(this.basinGroup);

    this.ambientLight = new AmbientLight('#a8c8db', 1.75);
    this.sunLight = new DirectionalLight('#fff4d6', 3.8);
    this.sunLight.position.set(8, 15, 6);
    this.fillLight = new DirectionalLight('#9fd7ff', 1.2);
    this.fillLight.position.set(-7, 8, -5);
    this.scene.add(this.ambientLight, this.sunLight, this.fillLight, this.rainMesh);

    this.resizeObserver = new ResizeObserver(() => this.resize(container));
    this.resizeObserver.observe(container);
    this.renderer.domElement.addEventListener('pointerdown', (event) =>
      this.handlePointerDown(event),
    );
    this.renderer.domElement.addEventListener('pointerup', (event) =>
      this.handlePointerUp(event),
    );
    this.renderer.domElement.addEventListener('pointermove', (event) =>
      this.handlePointerMove(event),
    );
    this.renderer.domElement.addEventListener('pointerleave', (event) =>
      this.handlePointerLeave(event),
    );
    this.renderer.domElement.addEventListener('contextmenu', (event) =>
      event.preventDefault(),
    );
    this.renderer.domElement.addEventListener('dragover', (event) =>
      this.handleDragOver(event),
    );
    this.renderer.domElement.addEventListener('dragleave', (event) =>
      this.handleDragLeave(event),
    );
    this.renderer.domElement.addEventListener('drop', (event) =>
      this.handleDrop(event),
    );
    this.renderer.domElement.addEventListener(
      'wheel',
      (event) => this.handleWheel(event),
      { passive: false },
    );
    this.resize(container);
    this.update();
  }

  public setCells(cells: readonly BasinRenderCell[]): void {
    if (cells.length > this.maxCells) {
      throw new Error(`HydroRenderer capacity exceeded: ${cells.length}/${this.maxCells}`);
    }

    this.cells = cells;
    this.terrainMesh.count = cells.length;
    this.removeStaleStructureVisuals(cells);
  }

  public setWeather(weather: WeatherState): void {
    this.currentWeather = weather;
  }

  public setBuildPreview(structureType?: number): void {
    if (this.buildPreview) {
      this.structureLayer.remove(this.buildPreview.group);
      this.buildPreview = undefined;
    }

    if (structureType === undefined) {
      return;
    }

    const group = this.createStructureModel(structureType, false);
    const materials: BuildPreviewMaterialState[] = [];

    group.visible = false;
    group.traverse((child) => {
      if (
        child instanceof Mesh &&
        (child.material instanceof MeshBasicMaterial ||
          child.material instanceof MeshStandardMaterial)
      ) {
        const material = child.material.clone();

        material.transparent = true;
        material.opacity = 0.38;
        material.depthWrite = false;
        child.material = material;
        materials.push({
          material,
          color: material.color.clone(),
          opacity: material.opacity,
        });
      }
    });
    this.buildPreview = { group, structureType, materials };
    this.structureLayer.add(group);
  }

  public zoomIn(): void {
    this.setZoom(this.zoom * MAP_ZOOM_STEP);
  }

  public zoomOut(): void {
    this.setZoom(this.zoom / MAP_ZOOM_STEP);
  }

  public resetZoom(): void {
    this.setZoom(1);
    this.setPan(0, 0);
  }

  public fitMap(): void {
    this.setZoom(this.getFitZoom());
    this.setPan(0, 0);
  }

  public update(): void {
    const elapsedSeconds = performance.now() / 1000;
    this.updateWeatherLighting(elapsedSeconds);

    for (let index = 0; index < this.cells.length; index += 1) {
      const cell = this.cells[index];
      const elevation = Terrain.elevation[cell.eid];
      const targetWaterDepth = Math.max(0, Water.depth[cell.eid]);
      const structureType = Number(Structure.type[cell.eid]);
      const pendingType = Number(Structure.pendingType[cell.eid]);
      const displayStructureType =
        structureType !== StructureCode.none ? structureType : pendingType;
      const previousStructureType =
        this.previousStructureTypes.get(cell.eid) ?? displayStructureType;

      if (
        previousStructureType !== displayStructureType &&
        displayStructureType !== StructureCode.none
      ) {
        this.structurePulseUntil.set(cell.eid, elapsedSeconds + 1.2);
      }
      this.previousStructureTypes.set(cell.eid, displayStructureType);

      const previousDisplayDepth =
        this.displayedWaterDepths.get(cell.eid) ?? targetWaterDepth;
      const waterDepth =
        previousDisplayDepth + (targetWaterDepth - previousDisplayDepth) * 0.16;
      this.displayedWaterDepths.set(cell.eid, waterDepth);
      const position = this.hexToWorld(cell.q, cell.r);
      const surfaceType = Number(Terrain.surfaceType[cell.eid]);
      const surfaceDepthHeight =
        surfaceType === SurfaceKind.water ? Math.min(0.52, waterDepth * 0.42) : 0;
      const terrainHeight = 0.36 + elevation * 0.16 + surfaceDepthHeight;
      this.matrix.compose(
        new Vector3(position.x, terrainHeight * 0.5 - 0.36, position.z),
        this.terrainMesh.quaternion,
        new Vector3(1, Math.max(0.08, terrainHeight), 1),
      );
      this.terrainMesh.setMatrixAt(index, this.matrix);

      const elevationT = Math.min(1, Math.max(0, (elevation + 1.5) / 4));
      if (surfaceType === SurfaceKind.water) {
        const depthT = Math.min(1, waterDepth / 0.7);

        this.color.copy(CHANNEL_LOW).lerp(CHANNEL_HIGH, depthT);
      } else if (surfaceType === SurfaceKind.shore) {
        this.color.copy(SHORE_LOW).lerp(SHORE_HIGH, elevationT);
      } else {
        this.color.copy(LAND_LOW).lerp(LAND_HIGH, elevationT);
      }
      if (WaterSource.active[cell.eid] === 1) {
        this.color.lerp(HEADWATER_TINT, 0.38);
      }
      if (this.buildPreview) {
        const canBuild =
          this.canPreviewBuild?.(cell, this.buildPreview.structureType) ?? true;

        this.color.lerp(canBuild ? VALID_PREVIEW_COLOR : INVALID_PREVIEW_COLOR, 0.28);
      }
      this.terrainMesh.setColorAt(index, this.color);

      this.updateStructureVisual(
        cell,
        displayStructureType,
        position,
        terrainHeight,
        elapsedSeconds,
      );
    }

    for (let index = this.cells.length; index < this.maxCells; index += 1) {
      this.matrix.compose(new Vector3(0, -100, 0), this.terrainMesh.quaternion, this.hiddenScale);
      this.terrainMesh.setMatrixAt(index, this.matrix);
    }

    this.terrainMesh.instanceMatrix.needsUpdate = true;

    if (this.terrainMesh.instanceColor) {
      this.terrainMesh.instanceColor.needsUpdate = true;
    }

    this.updateWeatherEffects(elapsedSeconds);
  }

  public start(): void {
    const render = (): void => {
      this.animationFrameId = window.requestAnimationFrame(render);

      try {
        this.update();
        this.renderer.render(this.scene, this.camera);
      } catch (error) {
        console.error('HydroStrategist render frame failed.', error);
      }
    };

    render();
  }

  public dispose(): void {
    window.cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }

  private resize(container: HTMLElement): void {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private setZoom(nextZoom: number): void {
    this.zoom = Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, nextZoom));
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
  }

  private setPan(nextPanX: number, nextPanZ: number): void {
    this.panX = nextPanX;
    this.panZ = nextPanZ;
    this.basinGroup.position.set(this.panX, 0, this.panZ);
  }

  private getFitZoom(): number {
    if (this.cells.length <= 1) {
      return 1;
    }

    const positions = this.cells.map((cell) => this.hexToWorld(cell.q, cell.r));
    const minX = Math.min(...positions.map((position) => position.x));
    const maxX = Math.max(...positions.map((position) => position.x));
    const minZ = Math.min(...positions.map((position) => position.z));
    const maxZ = Math.max(...positions.map((position) => position.z));
    const span = Math.max(maxX - minX, maxZ - minZ, 1);

    return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, 8.5 / span));
  }

  private handleWheel(event: WheelEvent): void {
    event.preventDefault();

    if (event.deltaY < 0) {
      this.zoomIn();
    } else if (event.deltaY > 0) {
      this.zoomOut();
    }
  }

  private hexToWorld(q: number, r: number): { readonly x: number; readonly z: number } {
    const hex = new RenderHex({ q, r });
    const x = hex.x * this.tileRadiusMeters;
    const z = hex.y * this.tileRadiusMeters;

    return { x, z };
  }

  private updateWeatherLighting(elapsedSeconds: number): void {
    this.scene.background = new Color(SKY_BY_WEATHER[this.currentWeather]);
    const stormPulse =
      this.currentWeather === 'storm'
        ? Math.max(0, Math.sin(elapsedSeconds * 9.5)) * 0.55
        : 0;

    if (this.currentWeather === 'sunny') {
      this.ambientLight.intensity = 1.9;
      this.sunLight.intensity = 4.2;
      this.fillLight.intensity = 1.1;
      return;
    }

    if (this.currentWeather === 'cloudy') {
      this.ambientLight.intensity = 1.55;
      this.sunLight.intensity = 2.2;
      this.fillLight.intensity = 1.45;
      return;
    }

    if (this.currentWeather === 'lightRain') {
      this.ambientLight.intensity = 1.32;
      this.sunLight.intensity = 1.55;
      this.fillLight.intensity = 1.8;
      return;
    }

    if (this.currentWeather === 'heavyRain') {
      this.ambientLight.intensity = 1.05;
      this.sunLight.intensity = 1.05;
      this.fillLight.intensity = 2.1;
      return;
    }

    this.ambientLight.intensity = 0.92 + stormPulse;
    this.sunLight.intensity = 0.72 + stormPulse * 2.5;
    this.fillLight.intensity = 2.2 + stormPulse;
  }

  private updateWeatherEffects(elapsedSeconds: number): void {
    const rainCount =
      this.currentWeather === 'storm'
        ? RAIN_DROP_COUNT
        : this.currentWeather === 'heavyRain'
          ? 96
          : this.currentWeather === 'lightRain'
            ? 44
            : 0;

    this.rainMesh.count = rainCount;

    for (let index = 0; index < rainCount; index += 1) {
      const lane = index / Math.max(1, rainCount);
      const x = ((index * 17) % 41) - 20 + Math.sin(lane * 19) * 0.8;
      const z = ((index * 29) % 37) - 18 + Math.cos(lane * 23) * 0.8;
      const fallSpeed = this.currentWeather === 'storm' ? 13 : 9;
      const y = 8 - ((elapsedSeconds * fallSpeed + index * 0.37) % 12);
      const slant = this.currentWeather === 'storm' ? -0.45 : -0.2;

      this.matrix.compose(
        new Vector3(x + y * slant, y, z),
        this.rainMesh.quaternion,
        new Vector3(1, this.currentWeather === 'lightRain' ? 0.7 : 1.25, 1),
      );
      this.rainMesh.setMatrixAt(index, this.matrix);
    }

    this.rainMesh.instanceMatrix.needsUpdate = true;
    const rainMaterial = this.rainMesh.material;

    if (rainMaterial instanceof Material) {
      rainMaterial.opacity = this.currentWeather === 'storm' ? 0.78 : 0.62;
    }
  }

  private updateStructureVisual(
    cell: BasinRenderCell,
    structureType: number,
    position: { readonly x: number; readonly z: number },
    terrainHeight: number,
    elapsedSeconds: number,
  ): void {
    const underConstruction = Structure.constructionTurnsRemaining[cell.eid] > 0;
    const hasStructure =
      Terrain.active[cell.eid] === 1 && structureType !== StructureCode.none;
    const existing = this.structureVisuals.get(cell.eid);

    if (!hasStructure) {
      if (existing) {
        this.structureLayer.remove(existing.group);
        this.structureVisuals.delete(cell.eid);
      }
      return;
    }

    let visual = existing;
    if (
      !visual ||
      visual.structureType !== structureType ||
      visual.underConstruction !== underConstruction
    ) {
      if (visual) {
        this.structureLayer.remove(visual.group);
      }
      visual = {
        group: this.createStructureModel(structureType, underConstruction),
        structureType,
        underConstruction,
      };
      this.structureVisuals.set(cell.eid, visual);
      this.structureLayer.add(visual.group);
    }

    const pulseRemaining = Math.max(
      0,
      (this.structurePulseUntil.get(cell.eid) ?? 0) - elapsedSeconds,
    );
    const pulse = pulseRemaining > 0 ? 1 + Math.sin(pulseRemaining * 18) * 0.06 : 1;
    const constructionProgress = underConstruction
      ? Math.max(0.25, Math.min(1, Structure.constructionProgress[cell.eid]))
      : 1;

    visual.group.position.set(
      position.x,
      terrainHeight * 0.72 - 0.32,
      position.z,
    );
    visual.group.rotation.y = this.getStructureRotation(cell, structureType);
    visual.group.scale.set(pulse, constructionProgress, pulse);
    visual.group.visible = true;
  }

  private createStructureModel(
    structureType: number,
    underConstruction: boolean,
  ): Group {
    if (structureType === StructureKind.baseDam) {
      return this.createDamModel(false, underConstruction);
    }

    if (structureType === StructureKind.elevationDam) {
      return this.createDamModel(true, underConstruction);
    }

    if (structureType === StructureKind.conduit) {
      return this.createConduitModel(underConstruction);
    }

    return this.createPowerhouseModel(underConstruction);
  }

  private createDamModel(elevated: boolean, underConstruction: boolean): Group {
    const group = new Group();
    const mainColor = elevated ? ELEVATION_DAM_COLOR : DAM_COLOR;
    const wallMaterial = this.createStructureMaterial(
      underConstruction ? CONSTRUCTION_COLOR : mainColor,
      0.08,
    );
    const accentMaterial = this.createStructureMaterial(
      underConstruction ? CONSTRUCTION_COLOR : new Color('#5b6670'),
      0.22,
    );
    const wallHeight = elevated ? 1.05 : 0.72;
    const wall = new Mesh(new BoxGeometry(2.15, wallHeight, 0.34), wallMaterial);
    const buttressGeometry = new BoxGeometry(0.3, wallHeight + 0.18, 0.68);
    const leftButtress = new Mesh(buttressGeometry, wallMaterial);
    const rightButtress = new Mesh(buttressGeometry, wallMaterial);
    const spillway = new Mesh(
      new BoxGeometry(0.72, 0.14, 0.52),
      accentMaterial,
    );

    wall.position.y = wallHeight * 0.5;
    leftButtress.position.set(-0.82, (wallHeight + 0.18) * 0.5, 0);
    rightButtress.position.set(0.82, (wallHeight + 0.18) * 0.5, 0);
    spillway.position.set(0, wallHeight + 0.05, 0);
    group.add(wall, leftButtress, rightButtress, spillway);

    for (let gateIndex = -1; gateIndex <= 1; gateIndex += 1) {
      const gate = new Mesh(new BoxGeometry(0.16, wallHeight * 0.58, 0.08), accentMaterial);

      gate.position.set(gateIndex * 0.24, wallHeight * 0.4, 0.21);
      group.add(gate);
    }

    if (elevated) {
      const cap = new Mesh(new BoxGeometry(2.32, 0.12, 0.48), wallMaterial);

      cap.position.y = wallHeight + 0.16;
      group.add(cap);
    }

    return group;
  }

  private createConduitModel(underConstruction: boolean): Group {
    const group = new Group();
    const pipeMaterial = this.createStructureMaterial(
      underConstruction ? CONSTRUCTION_COLOR : CONDUIT_COLOR,
      0.34,
    );
    const ringMaterial = this.createStructureMaterial(
      underConstruction ? CONSTRUCTION_COLOR : new Color('#54606a'),
      0.48,
    );
    const bed = new Mesh(new BoxGeometry(1.9, 0.14, 0.54), ringMaterial);
    const pipe = new Mesh(new CylinderGeometry(0.18, 0.18, 1.7, 12), pipeMaterial);

    bed.position.y = 0.07;
    pipe.rotation.z = Math.PI / 2;
    pipe.position.y = 0.28;
    group.add(bed, pipe);

    for (const x of [-0.58, 0.58]) {
      const ring = new Mesh(new CylinderGeometry(0.23, 0.23, 0.1, 12), ringMaterial);

      ring.rotation.z = Math.PI / 2;
      ring.position.set(x, 0.28, 0);
      group.add(ring);
    }

    return group;
  }

  private createPowerhouseModel(underConstruction: boolean): Group {
    const group = new Group();
    const bodyMaterial = this.createStructureMaterial(
      underConstruction ? CONSTRUCTION_COLOR : POWERHOUSE_COLOR,
      0.06,
    );
    const roofMaterial = this.createStructureMaterial(
      underConstruction ? CONSTRUCTION_COLOR : new Color('#546b75'),
      0.18,
    );
    const turbineMaterial = this.createStructureMaterial(
      underConstruction ? CONSTRUCTION_COLOR : new Color('#2e8da6'),
      0.42,
    );
    const base = new Mesh(new BoxGeometry(1.02, 0.22, 0.9), roofMaterial);
    const body = new Mesh(new BoxGeometry(0.88, 0.64, 0.76), bodyMaterial);
    const roof = new Mesh(new ConeGeometry(0.67, 0.34, 4), roofMaterial);
    const intake = new Mesh(new BoxGeometry(0.42, 0.34, 0.72), roofMaterial);
    const turbine = new Mesh(
      new CylinderGeometry(0.22, 0.22, 0.22, 14),
      turbineMaterial,
    );

    base.position.y = 0.11;
    body.position.y = 0.48;
    roof.position.y = 0.97;
    roof.rotation.y = Math.PI / 4;
    intake.position.set(-0.58, 0.28, 0);
    turbine.rotation.x = Math.PI / 2;
    turbine.position.set(0.12, 0.45, 0.49);
    group.add(base, body, roof, intake, turbine);

    return group;
  }

  private createStructureMaterial(color: Color, metalness: number): MeshStandardMaterial {
    return new MeshStandardMaterial({
      color,
      roughness: 0.58,
      metalness,
    });
  }

  private getStructureRotation(cell: BasinRenderCell, structureType: number): number {
    const center = this.hexToWorld(cell.q, cell.r);
    const neighbors = this.cells.filter((candidate) => {
      const deltaQ = candidate.q - cell.q;
      const deltaR = candidate.r - cell.r;

      return (
        (deltaQ === 1 && deltaR === 0) ||
        (deltaQ === 1 && deltaR === -1) ||
        (deltaQ === 0 && deltaR === -1) ||
        (deltaQ === -1 && deltaR === 0) ||
        (deltaQ === -1 && deltaR === 1) ||
        (deltaQ === 0 && deltaR === 1)
      );
    });
    const waterNeighbors = neighbors.filter(
      (candidate) => Terrain.surfaceType[candidate.eid] === SurfaceKind.water,
    );
    const target =
      waterNeighbors.sort(
        (left, right) => Terrain.elevation[left.eid] - Terrain.elevation[right.eid],
      )[0] ?? neighbors[0];

    if (!target) {
      return 0;
    }

    const targetPosition = this.hexToWorld(target.q, target.r);
    const directionAngle = Math.atan2(
      -(targetPosition.z - center.z),
      targetPosition.x - center.x,
    );

    return structureType === StructureKind.baseDam ||
      structureType === StructureKind.elevationDam
      ? directionAngle + Math.PI / 2
      : directionAngle;
  }

  private removeStaleStructureVisuals(cells: readonly BasinRenderCell[]): void {
    const activeEids = new Set(cells.map((cell) => cell.eid));

    for (const [eid, visual] of this.structureVisuals) {
      if (!activeEids.has(eid)) {
        this.structureLayer.remove(visual.group);
        this.structureVisuals.delete(eid);
      }
    }
  }

  private getCellAtPointer(event: PointerEvent | MouseEvent): BasinRenderCell | undefined {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointerNdc.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
    this.basinGroup.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const hits = this.raycaster.intersectObject(this.terrainMesh, false);
    const hit = hits[0];

    if (hit?.instanceId === undefined) {
      return undefined;
    }

    return this.cells[hit.instanceId];
  }

  private handlePointerDown(event: PointerEvent): void {
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      this.panStart = {
        x: event.clientX,
        y: event.clientY,
        panX: this.panX,
        panZ: this.panZ,
        pointerId: event.pointerId,
      };
      this.renderer.domElement.setPointerCapture(event.pointerId);
      return;
    }

    const cell = this.getCellAtPointer(event);

    if (!cell) {
      return;
    }

    this.dragStart = {
      cell,
      x: event.clientX,
      y: event.clientY,
    };
    this.renderer.domElement.setPointerCapture(event.pointerId);
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.panStart && this.panStart.pointerId === event.pointerId) {
      this.panStart = undefined;
      this.renderer.domElement.releasePointerCapture(event.pointerId);
      return;
    }

    if (!this.dragStart) {
      return;
    }

    const start = this.dragStart;
    this.dragStart = undefined;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const dragDistance = Math.hypot(deltaX, deltaY);

    if (dragDistance > 34 && this.onCellDragged) {
      this.onCellDragged(start.cell, this.getDragDirection(deltaX, deltaY), {
        x: event.clientX,
        y: event.clientY,
      });
      return;
    }

    this.onCellSelected?.(start.cell, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.panStart) {
      const panScale = 0.028 / Math.max(0.2, this.zoom);

      this.setPan(
        this.panStart.panX + (event.clientX - this.panStart.x) * panScale,
        this.panStart.panZ + (event.clientY - this.panStart.y) * panScale,
      );
      return;
    }

    const cell = this.getCellAtPointer(event);

    if (cell?.eid === this.hoveredCellEid) {
      this.onCellHovered?.(cell, { x: event.clientX, y: event.clientY });
      return;
    }

    this.hoveredCellEid = cell?.eid;
    this.onCellHovered?.(cell, { x: event.clientX, y: event.clientY });
  }

  private handlePointerLeave(event: PointerEvent): void {
    if (this.panStart?.pointerId === event.pointerId) {
      this.panStart = undefined;
    }
    this.hoveredCellEid = undefined;
    this.onCellHovered?.(undefined, { x: event.clientX, y: event.clientY });
  }

  private getDragDirection(deltaX: number, deltaY: number): number {
    const angle = (Math.atan2(-deltaY, deltaX) + Math.PI * 2) % (Math.PI * 2);

    return Math.floor((angle + Math.PI / 6) / (Math.PI / 3)) % 6;
  }

  private handleDrop(event: DragEvent): void {
    if (!this.onCellDropped) {
      return;
    }

    event.preventDefault();
    const cell = this.getCellAtPointer(event);

    if (!cell) {
      return;
    }

    if (this.buildPreview) {
      this.buildPreview.group.visible = false;
      this.buildPreview.cellEid = undefined;
    }

    this.onCellDropped(cell, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  private handleDragOver(event: DragEvent): void {
    event.preventDefault();

    if (!this.buildPreview) {
      return;
    }

    const cell = this.getCellAtPointer(event);

    if (!cell) {
      this.buildPreview.group.visible = false;
      this.buildPreview.cellEid = undefined;
      this.buildPreview.valid = undefined;
      return;
    }

    const isValid =
      this.canPreviewBuild?.(cell, this.buildPreview.structureType) ?? true;
    const position = this.hexToWorld(cell.q, cell.r);
    const surfaceType = Number(Terrain.surfaceType[cell.eid]);
    const waterDepth = Math.max(0, Water.depth[cell.eid]);
    const terrainHeight =
      0.36 +
      Terrain.elevation[cell.eid] * 0.16 +
      (surfaceType === SurfaceKind.water ? Math.min(0.52, waterDepth * 0.42) : 0);

    this.buildPreview.cellEid = cell.eid;
    this.applyBuildPreviewValidity(this.buildPreview, isValid);
    this.buildPreview.group.position.set(
      position.x,
      terrainHeight * 0.72 - 0.32,
      position.z,
    );
    this.buildPreview.group.rotation.y = this.getStructureRotation(
      cell,
      this.buildPreview.structureType,
    );
    this.buildPreview.group.scale.set(1.03, 1.03, 1.03);
    this.buildPreview.group.visible = true;
  }

  private applyBuildPreviewValidity(preview: BuildPreview, isValid: boolean): void {
    if (preview.valid === isValid) {
      return;
    }

    preview.valid = isValid;
    for (const state of preview.materials) {
      state.material.color.copy(isValid ? state.color : INVALID_PREVIEW_COLOR);
      state.material.opacity = isValid ? state.opacity : 0.52;
    }
  }

  private handleDragLeave(event: DragEvent): void {
    const relatedTarget = event.relatedTarget;

    if (
      this.buildPreview &&
      (!(relatedTarget instanceof Node) ||
        !this.renderer.domElement.contains(relatedTarget))
    ) {
      this.buildPreview.group.visible = false;
      this.buildPreview.cellEid = undefined;
      this.buildPreview.valid = undefined;
    }
  }
}

interface CanvasCellProjection {
  readonly cell: BasinRenderCell;
  readonly x: number;
  readonly y: number;
}

const CANVAS_HEX_DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

export class CanvasHydroRenderer implements HydroRendererPort {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private cells: readonly BasinRenderCell[];
  private currentWeather: WeatherState = 'sunny';
  private buildPreviewType?: number;
  private previewCell?: BasinRenderCell;
  private previewValid = true;
  private animationFrameId = 0;
  private zoom = 1;
  private readonly onCellSelected?: HydroRendererOptions['onCellSelected'];
  private readonly onCellDragged?: HydroRendererOptions['onCellDragged'];
  private readonly onCellDropped?: HydroRendererOptions['onCellDropped'];
  private readonly onCellHovered?: HydroRendererOptions['onCellHovered'];
  private readonly canPreviewBuild?: HydroRendererOptions['canPreviewBuild'];
  private panX = 0;
  private panY = 0;
  private panStart:
    | {
        readonly x: number;
        readonly y: number;
        readonly panX: number;
        readonly panY: number;
        readonly pointerId: number;
      }
    | undefined;
  private hoveredCellEid: number | undefined;
  private dragStart:
    | {
        readonly cell: BasinRenderCell;
        readonly x: number;
        readonly y: number;
      }
    | undefined;

  public constructor(container: HTMLElement, options: HydroRendererOptions) {
    this.cells = options.cells;
    this.onCellSelected = options.onCellSelected;
    this.onCellDragged = options.onCellDragged;
    this.onCellDropped = options.onCellDropped;
    this.onCellHovered = options.onCellHovered;
    this.canPreviewBuild = options.canPreviewBuild;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fallback-map';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.tabIndex = 0;

    const context = this.canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D context could not be created.');
    }

    this.context = context;
    container.appendChild(this.canvas);
    this.canvas.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
    this.canvas.addEventListener('pointerup', (event) => this.handlePointerUp(event));
    this.canvas.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    this.canvas.addEventListener('pointerleave', (event) => this.handlePointerLeave(event));
    this.canvas.addEventListener('dragover', (event) => this.handleDragOver(event));
    this.canvas.addEventListener('dragleave', () => {
      this.previewCell = undefined;
      this.previewValid = true;
      this.update();
    });
    this.canvas.addEventListener('drop', (event) => this.handleDrop(event));
    this.canvas.addEventListener('wheel', (event) => this.handleWheel(event), {
      passive: false,
    });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.update();
  }

  public setCells(cells: readonly BasinRenderCell[]): void {
    this.cells = cells;
    this.update();
  }

  public setWeather(weather: WeatherState): void {
    this.currentWeather = weather;
  }

  public setBuildPreview(structureType?: number): void {
    this.buildPreviewType = structureType;
    this.previewCell = undefined;
    this.previewValid = true;
    this.update();
  }

  public zoomIn(): void {
    this.setZoom(this.zoom * MAP_ZOOM_STEP);
  }

  public zoomOut(): void {
    this.setZoom(this.zoom / MAP_ZOOM_STEP);
  }

  public resetZoom(): void {
    this.setZoom(1);
    this.setPan(0, 0);
  }

  public fitMap(): void {
    this.setZoom(this.getFitZoom());
    this.setPan(0, 0);
  }

  public update(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    if (
      this.canvas.width !== Math.floor(width * pixelRatio) ||
      this.canvas.height !== Math.floor(height * pixelRatio)
    ) {
      this.canvas.width = Math.floor(width * pixelRatio);
      this.canvas.height = Math.floor(height * pixelRatio);
    }

    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.draw(width, height);
  }

  public start(): void {
    const render = (): void => {
      this.animationFrameId = window.requestAnimationFrame(render);
      this.update();
    };

    render();
  }

  public dispose(): void {
    window.cancelAnimationFrame(this.animationFrameId);
    this.canvas.remove();
  }

  private draw(width: number, height: number): void {
    const context = this.context;

    context.clearRect(0, 0, width, height);
    context.fillStyle = SKY_BY_WEATHER[this.currentWeather];
    context.fillRect(0, 0, width, height);

    const projections = this.projectCells(width, height);

    for (const projection of projections) {
      this.drawHex(projection);
    }

    for (const projection of projections) {
      this.drawStructure(projection);
    }

    if (this.previewCell && this.buildPreviewType !== undefined) {
      const projection = projections.find(
        (candidate) => candidate.cell.eid === this.previewCell?.eid,
      );

      if (projection) {
        this.drawStructure(
          projection,
          this.buildPreviewType,
          this.previewValid ? 0.38 : 0.52,
          !this.previewValid,
        );
      }
    }

    this.drawWeatherOverlay(width, height);
    this.drawFallbackBadge(width);
  }

  private projectCells(width: number, height: number): CanvasCellProjection[] {
    if (this.cells.length === 0) {
      return [];
    }

    const raw = this.cells.map((cell) => ({
      cell,
      x: Math.sqrt(3) * (cell.q + cell.r / 2),
      y: 1.5 * cell.r,
    }));
    const minX = Math.min(...raw.map((item) => item.x));
    const maxX = Math.max(...raw.map((item) => item.x));
    const minY = Math.min(...raw.map((item) => item.y));
    const maxY = Math.max(...raw.map((item) => item.y));
    const mapWidth = Math.max(1, maxX - minX + 2.4);
    const mapHeight = Math.max(1, maxY - minY + 2.4);
    const radius =
      Math.max(18, Math.min(width / mapWidth, height / mapHeight) * 0.46) *
      this.zoom;
    const offsetX = width * 0.5 - ((minX + maxX) * 0.5) * radius;
    const offsetY = height * 0.5 - ((minY + maxY) * 0.5) * radius;

    return raw.map((item) => ({
      cell: item.cell,
      x: item.x * radius + offsetX + this.panX,
      y: item.y * radius + offsetY + this.panY,
    }));
  }

  private drawHex(projection: CanvasCellProjection): void {
    const context = this.context;
    const radius = this.getDrawRadius();
    const { cell, x, y } = projection;
    const surfaceType = Number(Terrain.surfaceType[cell.eid]);
    const waterDepth = Math.max(0, Water.depth[cell.eid]);
    const elevation = Terrain.elevation[cell.eid];

    context.save();
    this.traceHex(x, y + 7, radius);
    context.fillStyle = '#061923';
    context.globalAlpha = 0.42;
    context.fill();
    context.globalAlpha = 1;
    this.traceHex(x, y, radius);
    context.fillStyle = this.getSurfaceColor(surfaceType, waterDepth, elevation);
    context.fill();
    context.strokeStyle = surfaceType === SurfaceKind.water ? '#7adfff' : '#243a2d';
    context.lineWidth = 1.2;
    context.globalAlpha = 0.75;
    context.stroke();

    if (WaterSource.active[cell.eid] === 1) {
      context.globalAlpha = 0.45;
      this.traceHex(x, y, radius * 0.72);
      context.fillStyle = '#a7e9ff';
      context.fill();
    }

    if (surfaceType === SurfaceKind.water) {
      context.globalAlpha = 0.34;
      this.traceHex(x, y, radius * Math.max(0.34, Math.min(0.82, waterDepth + 0.32)));
      context.fillStyle = '#d3f8ff';
      context.fill();
    }

    if (this.buildPreviewType !== undefined) {
      const canBuild = this.canPreviewBuild?.(cell, this.buildPreviewType) ?? true;

      context.globalAlpha = canBuild ? 0.22 : 0.3;
      this.traceHex(x, y, radius * 0.96);
      context.fillStyle = canBuild ? '#78e6a8' : '#ff4f5f';
      context.fill();
      context.globalAlpha = 0.72;
      context.strokeStyle = canBuild ? '#a7ffd0' : '#ff9aa4';
      context.lineWidth = 2;
      context.stroke();
    }

    context.restore();
  }

  private drawStructure(
    projection: CanvasCellProjection,
    overrideType?: number,
    alpha = 1,
    invalidPreview = false,
  ): void {
    const context = this.context;
    const structureType =
      overrideType ??
      (Structure.type[projection.cell.eid] !== StructureCode.none
        ? Number(Structure.type[projection.cell.eid])
        : Number(Structure.pendingType[projection.cell.eid]));

    if (structureType === StructureCode.none) {
      return;
    }

    const radius = this.getDrawRadius();
    const x = projection.x;
    const y = projection.y;
    const underConstruction =
      overrideType === undefined &&
      Structure.constructionTurnsRemaining[projection.cell.eid] > 0;

    context.save();
    context.globalAlpha = alpha;
    context.translate(x, y);
    context.shadowColor = invalidPreview
      ? 'rgba(255, 79, 95, 0.55)'
      : 'rgba(0, 0, 0, 0.35)';
    context.shadowBlur = 8;
    context.shadowOffsetY = 4;

    if (structureType === StructureKind.baseDam || structureType === StructureKind.elevationDam) {
      context.fillStyle = invalidPreview
        ? '#ff4f5f'
        : underConstruction
          ? '#f2d16b'
          : '#d3ad67';
      context.fillRect(-radius * 0.62, -radius * 0.16, radius * 1.24, radius * 0.32);
      context.fillStyle = invalidPreview
        ? '#ffd0d5'
        : structureType === StructureKind.elevationDam
          ? '#d8e1e8'
          : '#b88f4a';
      context.fillRect(-radius * 0.5, -radius * 0.28, radius, radius * 0.16);
    } else if (structureType === StructureKind.conduit) {
      context.strokeStyle = invalidPreview
        ? '#ff4f5f'
        : underConstruction
          ? '#f2d16b'
          : '#f0a14d';
      context.lineWidth = Math.max(6, radius * 0.22);
      context.beginPath();
      context.moveTo(-radius * 0.55, 0);
      context.lineTo(radius * 0.55, 0);
      context.stroke();
      context.lineWidth = Math.max(2, radius * 0.07);
      context.strokeStyle = invalidPreview ? '#ffd0d5' : '#5d6870';
      context.stroke();
    } else if (structureType === StructureKind.powerhouse) {
      context.fillStyle = invalidPreview
        ? '#ff4f5f'
        : underConstruction
          ? '#f2d16b'
          : '#f3efd8';
      context.fillRect(-radius * 0.32, -radius * 0.18, radius * 0.64, radius * 0.42);
      context.fillStyle = invalidPreview ? '#ffd0d5' : '#546b75';
      context.beginPath();
      context.moveTo(-radius * 0.42, -radius * 0.18);
      context.lineTo(0, -radius * 0.52);
      context.lineTo(radius * 0.42, -radius * 0.18);
      context.closePath();
      context.fill();
      context.fillStyle = invalidPreview ? '#8b1624' : '#2e8da6';
      context.beginPath();
      context.arc(radius * 0.36, radius * 0.06, radius * 0.12, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }

  private drawWeatherOverlay(width: number, height: number): void {
    if (this.currentWeather !== 'lightRain' && this.currentWeather !== 'heavyRain' && this.currentWeather !== 'storm') {
      return;
    }

    const context = this.context;
    const count = this.currentWeather === 'storm' ? 80 : this.currentWeather === 'heavyRain' ? 54 : 24;
    const elapsed = performance.now() / 1000;

    context.save();
    context.strokeStyle = this.currentWeather === 'storm' ? '#b8eaff' : '#8ccde8';
    context.globalAlpha = this.currentWeather === 'storm' ? 0.5 : 0.36;
    context.lineWidth = this.currentWeather === 'lightRain' ? 1 : 1.5;

    for (let index = 0; index < count; index += 1) {
      const x = ((index * 53 + elapsed * 120) % (width + 80)) - 40;
      const y = ((index * 71 + elapsed * 220) % (height + 80)) - 40;

      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - 10, y + 28);
      context.stroke();
    }

    context.restore();
  }

  private drawFallbackBadge(width: number): void {
    const context = this.context;

    context.save();
    context.fillStyle = 'rgba(10, 24, 31, 0.72)';
    context.strokeStyle = 'rgba(122, 223, 255, 0.35)';
    context.lineWidth = 1;
    context.beginPath();
    context.roundRect(Math.max(16, width * 0.5 - 142), 16, 284, 34, 8);
    context.fill();
    context.stroke();
    context.fillStyle = '#9df4df';
    context.font = '600 13px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('2D map fallback: WebGL is disabled in this browser', width * 0.5, 33);
    context.restore();
  }

  private getDrawRadius(): number {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const projections = this.projectCells(width, height);

    if (projections.length <= 1) {
      return Math.max(24, Math.min(width, height) * 0.08);
    }

    let nearest = Number.POSITIVE_INFINITY;

    for (let left = 0; left < projections.length; left += 1) {
      for (let right = left + 1; right < projections.length; right += 1) {
        const distance = Math.hypot(
          projections[left].x - projections[right].x,
          projections[left].y - projections[right].y,
        );

        if (distance > 1) {
          nearest = Math.min(nearest, distance);
        }
      }
    }

    return Number.isFinite(nearest)
      ? Math.max(18, Math.min(64, nearest / Math.sqrt(3) * 0.96))
      : Math.max(24, Math.min(width, height) * 0.08);
  }

  private traceHex(x: number, y: number, radius: number): void {
    const context = this.context;

    context.beginPath();
    for (let side = 0; side < 6; side += 1) {
      const angle = Math.PI / 6 + side * (Math.PI / 3);
      const pointX = x + Math.cos(angle) * radius;
      const pointY = y + Math.sin(angle) * radius;

      if (side === 0) {
        context.moveTo(pointX, pointY);
      } else {
        context.lineTo(pointX, pointY);
      }
    }
    context.closePath();
  }

  private getSurfaceColor(surfaceType: number, waterDepth: number, elevation: number): string {
    if (surfaceType === SurfaceKind.water) {
      const depthT = Math.max(0, Math.min(1, waterDepth / 0.7));
      const light = Math.round(68 - depthT * 30);

      return `hsl(205 82% ${light}%)`;
    }

    if (surfaceType === SurfaceKind.shore) {
      const light = Math.round(56 + Math.max(0, Math.min(1, elevation)) * 10);

      return `hsl(47 38% ${light}%)`;
    }

    const light = Math.round(38 + Math.max(0, Math.min(1, elevation)) * 10);

    return `hsl(91 27% ${light}%)`;
  }

  private getCellAtPointer(event: PointerEvent | MouseEvent): BasinRenderCell | undefined {
    const bounds = this.canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const radius = this.getDrawRadius();
    const projections = this.projectCells(bounds.width, bounds.height);

    return projections
      .map((projection) => ({
        cell: projection.cell,
        distance: Math.hypot(projection.x - x, projection.y - y),
      }))
      .filter((candidate) => candidate.distance <= radius)
      .sort((left, right) => left.distance - right.distance)[0]?.cell;
  }

  private setZoom(nextZoom: number): void {
    this.zoom = Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, nextZoom));
    this.update();
  }

  private setPan(nextPanX: number, nextPanY: number): void {
    this.panX = nextPanX;
    this.panY = nextPanY;
    this.update();
  }

  private getFitZoom(): number {
    return 1;
  }

  private handleWheel(event: WheelEvent): void {
    event.preventDefault();

    if (event.deltaY < 0) {
      this.zoomIn();
    } else if (event.deltaY > 0) {
      this.zoomOut();
    }
  }

  private handlePointerDown(event: PointerEvent): void {
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      this.panStart = {
        x: event.clientX,
        y: event.clientY,
        panX: this.panX,
        panY: this.panY,
        pointerId: event.pointerId,
      };
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }

    const cell = this.getCellAtPointer(event);

    if (!cell) {
      return;
    }

    this.dragStart = {
      cell,
      x: event.clientX,
      y: event.clientY,
    };
    this.canvas.setPointerCapture(event.pointerId);
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.panStart && this.panStart.pointerId === event.pointerId) {
      this.panStart = undefined;
      this.canvas.releasePointerCapture(event.pointerId);
      return;
    }

    if (!this.dragStart) {
      return;
    }

    const start = this.dragStart;
    this.dragStart = undefined;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const dragDistance = Math.hypot(deltaX, deltaY);

    if (dragDistance > 34 && this.onCellDragged) {
      this.onCellDragged(start.cell, this.getDragDirection(deltaX, deltaY), {
        x: event.clientX,
        y: event.clientY,
      });
      return;
    }

    this.onCellSelected?.(start.cell, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.panStart) {
      this.setPan(
        this.panStart.panX + event.clientX - this.panStart.x,
        this.panStart.panY + event.clientY - this.panStart.y,
      );
      return;
    }

    const cell = this.getCellAtPointer(event);

    if (cell?.eid === this.hoveredCellEid) {
      this.onCellHovered?.(cell, { x: event.clientX, y: event.clientY });
      return;
    }

    this.hoveredCellEid = cell?.eid;
    this.onCellHovered?.(cell, { x: event.clientX, y: event.clientY });
  }

  private handlePointerLeave(event: PointerEvent): void {
    if (this.panStart?.pointerId === event.pointerId) {
      this.panStart = undefined;
    }
    this.hoveredCellEid = undefined;
    this.onCellHovered?.(undefined, { x: event.clientX, y: event.clientY });
  }

  private getDragDirection(deltaX: number, deltaY: number): number {
    const angle = (Math.atan2(deltaY, deltaX) + Math.PI * 2) % (Math.PI * 2);
    const vectors = CANVAS_HEX_DIRECTIONS.map(([dq, dr]) => ({
      x: Math.sqrt(3) * (dq + dr / 2),
      y: 1.5 * dr,
    }));
    let bestDirection = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index < vectors.length; index += 1) {
      const vectorAngle = (Math.atan2(vectors[index].y, vectors[index].x) + Math.PI * 2) % (Math.PI * 2);
      const score = Math.abs(Math.atan2(Math.sin(angle - vectorAngle), Math.cos(angle - vectorAngle)));

      if (score < bestScore) {
        bestDirection = index;
        bestScore = score;
      }
    }

    return bestDirection;
  }

  private handleDragOver(event: DragEvent): void {
    event.preventDefault();
    this.previewCell = this.getCellAtPointer(event);
    this.previewValid =
      !this.previewCell ||
      this.buildPreviewType === undefined ||
      (this.canPreviewBuild?.(this.previewCell, this.buildPreviewType) ?? true);
    this.update();
  }

  private handleDrop(event: DragEvent): void {
    if (!this.onCellDropped) {
      return;
    }

    event.preventDefault();
    const cell = this.getCellAtPointer(event);

    if (!cell) {
      return;
    }

    this.previewCell = undefined;
    this.previewValid = true;
    this.onCellDropped(cell, {
      x: event.clientX,
      y: event.clientY,
    });
  }
}
