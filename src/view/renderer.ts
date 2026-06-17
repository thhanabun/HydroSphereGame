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
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';

import { Structure, StructureCode, StructureKind, Terrain, Water } from '../core/ecs/components';

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
}

const TERRAIN_LOW = new Color('#335f46');
const TERRAIN_HIGH = new Color('#b6a06f');
const WATER_SHALLOW = new Color('#3fb7d6');
const WATER_DEEP = new Color('#1f5ea8');
const DAM_COLOR = new Color('#d3ad67');
const ELEVATION_DAM_COLOR = new Color('#c8d0d8');
const CONDUIT_COLOR = new Color('#f0a14d');
const POWERHOUSE_COLOR = new Color('#f3efd8');
const CONSTRUCTION_COLOR = new Color('#f2d16b');
const RenderHex = defineHex({
  dimensions: 1,
  orientation: Orientation.POINTY,
  origin: 'topLeft',
});

export class HydroRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly terrainMesh: InstancedMesh;
  private readonly waterMesh: InstancedMesh;
  private readonly structureMesh: InstancedMesh;
  private cells: readonly BasinRenderCell[];
  private readonly tileRadiusMeters: number;
  private readonly maxCells: number;
  private readonly onCellSelected?: HydroRendererOptions['onCellSelected'];
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private readonly displayedWaterDepths = new Map<number, number>();
  private readonly previousStructureTypes = new Map<number, number>();
  private readonly structurePulseUntil = new Map<number, number>();
  private readonly hiddenScale = new Vector3(0, 0, 0);
  private readonly raycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private readonly resizeObserver: ResizeObserver;
  private animationFrameId = 0;

  public constructor(container: HTMLElement, options: HydroRendererOptions) {
    this.cells = options.cells;
    this.tileRadiusMeters = options.tileRadiusMeters;
    this.maxCells = options.maxCells ?? Math.max(64, options.cells.length);
    this.onCellSelected = options.onCellSelected;
    this.scene = new Scene();
    this.scene.background = new Color('#071017');
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
      color: '#5f8259',
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

    this.terrainMesh = new InstancedMesh(terrainGeometry, terrainMaterial, this.maxCells);
    this.waterMesh = new InstancedMesh(waterGeometry, waterMaterial, this.maxCells);
    this.structureMesh = new InstancedMesh(
      structureGeometry,
      structureMaterial,
      this.maxCells,
    );
    this.terrainMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.waterMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.structureMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.terrainMesh.count = this.cells.length;
    this.waterMesh.count = this.cells.length;
    this.structureMesh.count = this.cells.length;

    const basinGroup = new Group();
    basinGroup.add(this.terrainMesh, this.waterMesh, this.structureMesh);
    basinGroup.rotation.y = Math.PI / 6;
    this.scene.add(basinGroup);

    const ground = new Mesh(
      new PlaneGeometry(80, 80),
      new MeshStandardMaterial({ color: '#0d1d22', roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.38;
    this.scene.add(ground);

    const sun = new DirectionalLight('#fff4d6', 3.8);
    sun.position.set(8, 15, 6);
    const fill = new DirectionalLight('#9fd7ff', 1.2);
    fill.position.set(-7, 8, -5);
    this.scene.add(new AmbientLight('#a8c8db', 1.75), sun, fill);

    this.resizeObserver = new ResizeObserver(() => this.resize(container));
    this.resizeObserver.observe(container);
    this.renderer.domElement.addEventListener('click', (event) =>
      this.handleClick(event),
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

  public update(): void {
    const elapsedSeconds = performance.now() / 1000;

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
      const terrainHeight = 0.36 + elevation * 0.16;
      const waterHeight = Math.max(
        0.04,
        waterDepth * 2.35 +
          Math.sin(elapsedSeconds * 4.8 + cell.q * 0.9 + cell.r * 0.45) * 0.04,
      );

      this.matrix.compose(
        new Vector3(position.x, terrainHeight * 0.5 - 0.36, position.z),
        this.terrainMesh.quaternion,
        new Vector3(1, Math.max(0.08, terrainHeight), 1),
      );
      this.terrainMesh.setMatrixAt(index, this.matrix);

      const elevationT = Math.min(1, Math.max(0, (elevation + 1.5) / 4));
      this.color.copy(TERRAIN_LOW).lerp(TERRAIN_HIGH, elevationT);
      this.terrainMesh.setColorAt(index, this.color);

      this.matrix.compose(
        new Vector3(position.x, terrainHeight + waterHeight * 0.5 - 0.34, position.z),
        this.waterMesh.quaternion,
        new Vector3(1, waterHeight, 1),
      );
      this.waterMesh.setMatrixAt(index, this.matrix);

      const waterT = Math.min(1, waterDepth / 0.55);
      this.color.copy(WATER_SHALLOW).lerp(WATER_DEEP, waterT);
      this.waterMesh.setColorAt(index, this.color);

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
      this.waterMesh.setMatrixAt(index, this.matrix);
      this.structureMesh.setMatrixAt(index, this.matrix);
    }

    this.terrainMesh.instanceMatrix.needsUpdate = true;
    this.waterMesh.instanceMatrix.needsUpdate = true;
    this.structureMesh.instanceMatrix.needsUpdate = true;

    if (this.terrainMesh.instanceColor) {
      this.terrainMesh.instanceColor.needsUpdate = true;
    }

    if (this.waterMesh.instanceColor) {
      this.waterMesh.instanceColor.needsUpdate = true;
    }

    if (this.structureMesh.instanceColor) {
      this.structureMesh.instanceColor.needsUpdate = true;
    }
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

  private handleClick(event: MouseEvent): void {
    if (!this.onCellSelected) {
      return;
    }

    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointerNdc.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const hits = this.raycaster.intersectObject(this.terrainMesh, false);
    const hit = hits[0];

    if (hit?.instanceId === undefined) {
      return;
    }

    const cell = this.cells[hit.instanceId];

    if (!cell) {
      return;
    }

    this.onCellSelected(cell, {
      x: event.clientX,
      y: event.clientY,
    });
  }
}
