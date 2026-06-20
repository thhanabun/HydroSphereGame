import { Orientation, defineHex } from 'honeycomb-grid';
import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
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

export class HydroRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly terrainMesh: InstancedMesh;
  private readonly waterMesh: InstancedMesh;
  private readonly structureMesh: InstancedMesh;
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
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private readonly displayedWaterDepths = new Map<number, number>();
  private readonly previousStructureTypes = new Map<number, number>();
  private readonly structurePulseUntil = new Map<number, number>();
  private readonly hiddenScale = new Vector3(0, 0, 0);
  private readonly raycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private readonly resizeObserver: ResizeObserver;
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
    this.scene = new Scene();
    this.scene.background = new Color(SKY_BY_WEATHER.sunny);
    this.camera = new PerspectiveCamera(48, 1, 0.1, 1000);
    this.camera.position.set(0, 11, 14);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
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

    const waterGeometry = new CylinderGeometry(
      this.tileRadiusMeters * 0.94,
      this.tileRadiusMeters * 0.94,
      0.08,
      6,
      1,
      false,
    );
    const waterMaterial = new MeshStandardMaterial({
      color: '#2d95c7',
      emissive: '#075f90',
      emissiveIntensity: 0.28,
      transparent: true,
      opacity: 0.86,
      roughness: 0.36,
      metalness: 0.02,
    });

    const structureGeometry = new BoxGeometry(0.58, 0.72, 0.58);
    const structureMaterial = new MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#15232a',
      emissiveIntensity: 0.22,
      roughness: 0.5,
      metalness: 0.04,
    });
    const rainGeometry = new BoxGeometry(0.025, 1.25, 0.025);
    const rainMaterial = new MeshBasicMaterial({
      color: '#9bd8f2',
      transparent: true,
      opacity: 0.66,
    });

    this.terrainMesh = new InstancedMesh(terrainGeometry, terrainMaterial, this.maxCells);
    this.waterMesh = new InstancedMesh(waterGeometry, waterMaterial, this.maxCells);
    this.structureMesh = new InstancedMesh(
      structureGeometry,
      structureMaterial,
      this.maxCells,
    );
    this.rainMesh = new InstancedMesh(rainGeometry, rainMaterial, RAIN_DROP_COUNT);
    this.terrainMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.waterMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.structureMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.rainMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.terrainMesh.count = this.cells.length;
    this.waterMesh.count = this.cells.length;
    this.structureMesh.count = this.cells.length;
    this.rainMesh.count = 0;

    const basinGroup = new Group();
    basinGroup.add(this.terrainMesh, this.structureMesh);
    basinGroup.rotation.y = Math.PI / 6;
    this.scene.add(basinGroup);

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
    this.renderer.domElement.addEventListener('dragover', (event) =>
      event.preventDefault(),
    );
    this.renderer.domElement.addEventListener('drop', (event) =>
      this.handleDrop(event),
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
    this.waterMesh.count = cells.length;
    this.structureMesh.count = cells.length;
    this.update();
  }

  public setWeather(weather: WeatherState): void {
    this.currentWeather = weather;
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
      this.terrainMesh.setColorAt(index, this.color);

      const hasStructure =
        Terrain.active[cell.eid] === 1 &&
        displayStructureType !== StructureCode.none;
      const structureScale = hasStructure
        ? this.getStructureScale(cell.eid, elapsedSeconds)
        : this.hiddenScale;
      this.matrix.compose(
        new Vector3(position.x, terrainHeight + structureScale.y * 0.36, position.z),
        this.structureMesh.quaternion,
        structureScale,
      );
      this.structureMesh.setMatrixAt(index, this.matrix);
      this.structureMesh.setColorAt(index, this.getStructureColor(cell.eid));
    }

    for (let index = this.cells.length; index < this.maxCells; index += 1) {
      this.matrix.compose(new Vector3(0, -100, 0), this.terrainMesh.quaternion, this.hiddenScale);
      this.terrainMesh.setMatrixAt(index, this.matrix);
      this.structureMesh.setMatrixAt(index, this.matrix);
    }

    this.terrainMesh.instanceMatrix.needsUpdate = true;
    this.structureMesh.instanceMatrix.needsUpdate = true;

    if (this.terrainMesh.instanceColor) {
      this.terrainMesh.instanceColor.needsUpdate = true;
    }

    if (this.structureMesh.instanceColor) {
      this.structureMesh.instanceColor.needsUpdate = true;
    }

    this.updateWeatherEffects(elapsedSeconds);
  }

  public start(): void {
    const render = (): void => {
      this.animationFrameId = window.requestAnimationFrame(render);
      this.update();
      this.renderer.render(this.scene, this.camera);
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

  private getStructureScale(eid: number, elapsedSeconds: number): Vector3 {
    const structureType = Number(Structure.type[eid]);
    const pendingType = Number(Structure.pendingType[eid]);
    const displayStructureType =
      structureType !== StructureCode.none ? structureType : pendingType;
    const pulseUntil = this.structurePulseUntil.get(eid) ?? 0;
    const pulseRemaining = Math.max(0, pulseUntil - elapsedSeconds);
    const pulse = pulseRemaining > 0 ? 1 + Math.sin(pulseRemaining * 18) * 0.08 : 1;
    const applyPulse = (scale: Vector3): Vector3 =>
      scale.multiplyScalar(pulse).setY(scale.y / pulse);

    if (displayStructureType === StructureCode.none) {
      return this.hiddenScale;
    }

    const constructionProgress =
      Structure.constructionTurnsRemaining[eid] > 0
        ? Math.max(0.28, Math.min(1, Structure.constructionProgress[eid]))
        : 1;
    const applyConstructionProgress = (scale: Vector3): Vector3 =>
      scale.multiply(new Vector3(1, constructionProgress, 1));

    if (displayStructureType === StructureKind.baseDam) {
      return applyConstructionProgress(applyPulse(
        new Vector3(2.1, 0.72 + Math.max(0.2, Structure.damHeight[eid]) * 0.82, 0.88),
      ));
    }

    if (displayStructureType === StructureKind.elevationDam) {
      return applyConstructionProgress(applyPulse(
        new Vector3(1.85, 0.92 + Math.max(0, Structure.level[eid]) * 0.24, 0.78),
      ));
    }

    if (displayStructureType === StructureKind.conduit) {
      return applyConstructionProgress(applyPulse(new Vector3(1.95, 0.3, 0.42)));
    }

    if (displayStructureType === StructureKind.powerhouse) {
      return applyConstructionProgress(applyPulse(new Vector3(1.02, 1.18, 1.02)));
    }

    return applyConstructionProgress(applyPulse(new Vector3(1, 1, 1)));
  }

  private getStructureColor(eid: number): Color {
    const structureType = Number(Structure.type[eid]);
    const pendingType = Number(Structure.pendingType[eid]);
    const displayStructureType =
      structureType !== StructureCode.none ? structureType : pendingType;

    if (Structure.constructionTurnsRemaining[eid] > 0) {
      return CONSTRUCTION_COLOR;
    }

    if (displayStructureType === StructureKind.elevationDam) {
      return ELEVATION_DAM_COLOR;
    }

    if (displayStructureType === StructureKind.conduit) {
      return CONDUIT_COLOR;
    }

    if (displayStructureType === StructureKind.powerhouse) {
      return POWERHOUSE_COLOR;
    }

    return DAM_COLOR;
  }

  private getCellAtPointer(event: PointerEvent | MouseEvent): BasinRenderCell | undefined {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointerNdc.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const hits = this.raycaster.intersectObject(this.terrainMesh, false);
    const hit = hits[0];

    if (hit?.instanceId === undefined) {
      return undefined;
    }

    return this.cells[hit.instanceId];
  }

  private handlePointerDown(event: PointerEvent): void {
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

    this.onCellDropped(cell, {
      x: event.clientX,
      y: event.clientY,
    });
  }
}
