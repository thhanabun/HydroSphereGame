import { defineQuery, type IWorld } from 'bitecs';

import type { SimulationConstants } from '../../types';
import {
  HEX_DIRECTION_COUNT,
  NO_NEIGHBOR,
  StructureComponent,
  StructureKind,
  Terrain,
  Water,
  getFlow,
  oppositeDirection,
  setFlow,
} from '../components';

export interface HexGridTopology {
  readonly neighborEids: Int32Array;
  readonly directionCount?: 4 | typeof HEX_DIRECTION_COUNT;
  readonly oppositeDirections?: Int8Array | readonly number[];
}

export interface ShallowWaterSystemInput {
  readonly topology: HexGridTopology;
  readonly constants: SimulationConstants;
  readonly minimumWaterDepthMeters?: number;
}

export interface ShallowWaterSystemStats {
  readonly totalWaterDepthMeters: number;
  readonly maxWaterDepthMeters: number;
  readonly maxFlowCubicMetersPerSecond: number;
}

const waterQuery = defineQuery([Terrain, Water]);

const isDamStructure = (eid: number): boolean =>
  StructureComponent.active[eid] === 1 &&
  (StructureComponent.type[eid] === StructureKind.baseDam ||
    StructureComponent.type[eid] === StructureKind.elevationDam);

const getDamHeight = (eid: number): number =>
  isDamStructure(eid) ? Math.max(0, StructureComponent.damHeight[eid]) : 0;

const getReservoirHoldDepth = (eid: number): number =>
  isDamStructure(eid) ? Math.max(0, StructureComponent.maxWaterDepth[eid]) : 0;

const getTotalHydraulicHead = (eid: number): number =>
  Terrain.elevation[eid] + Math.max(0, Water.depth[eid]) + getDamHeight(eid);

const getDirectionCount = (topology: HexGridTopology): 4 | typeof HEX_DIRECTION_COUNT =>
  topology.directionCount === 4 ? 4 : HEX_DIRECTION_COUNT;

const getNeighborEid = (
  topology: HexGridTopology,
  eid: number,
  direction: number,
): number => {
  const directionCount = getDirectionCount(topology);

  return topology.neighborEids[eid * directionCount + direction] ?? NO_NEIGHBOR;
};

const getOppositeDirection = (
  topology: HexGridTopology,
  direction: number,
): number => {
  const mappedDirection = topology.oppositeDirections?.[direction];

  if (mappedDirection !== undefined) {
    return mappedDirection;
  }

  const directionCount = getDirectionCount(topology);

  return directionCount === HEX_DIRECTION_COUNT
    ? oppositeDirection(direction)
    : (direction + directionCount / 2) % directionCount;
};

export const ShallowWaterSystem = (
  world: IWorld,
  input: ShallowWaterSystemInput,
): ShallowWaterSystemStats => {
  const eids = waterQuery(world);
  const constants = input.constants;
  const deltaTimeSeconds = Math.max(0, constants.timeStepSeconds);
  const gravity = Math.max(0, constants.gravityMetersPerSecondSquared);
  const pipeArea = Math.max(0, constants.pipeCrossSectionAreaMetersSquared);
  const pipeLength = Math.max(Number.EPSILON, constants.pipeLengthMeters);
  const minimumDepth = Math.max(0, input.minimumWaterDepthMeters ?? 0);
  const directionCount = getDirectionCount(input.topology);
  let maxFlowCubicMetersPerSecond = 0;

  for (let index = 0; index < eids.length; index += 1) {
    const eid = eids[index];

    if (Terrain.active[eid] === 0) {
      continue;
    }

    const waterDepth = Math.max(0, Water.depth[eid]);
    const hydraulicHead = getTotalHydraulicHead(eid);
    const cellWidth = Math.max(
      Number.EPSILON,
      Terrain.cellWidth[eid] || constants.cellWidthMeters,
    );
    const cellHeight = Math.max(
      Number.EPSILON,
      Terrain.cellHeight[eid] || constants.cellHeightMeters,
    );
    const cellArea = cellWidth * cellHeight;
    const reservoirHoldDepth = getReservoirHoldDepth(eid);
    const spillableDepth = isDamStructure(eid)
      ? Math.max(0, waterDepth - reservoirHoldDepth)
      : waterDepth;
    const availableVolume = spillableDepth * cellArea;
    let outgoingFlowSum = 0;

    Water.hydraulicHead[eid] = hydraulicHead;

    for (let direction = 0; direction < directionCount; direction += 1) {
      const neighborEid = getNeighborEid(input.topology, eid, direction);

      if (neighborEid === NO_NEIGHBOR || Terrain.active[neighborEid] === 0) {
        setFlow(eid, direction, 0);
        continue;
      }

      if (isDamStructure(eid) && waterDepth <= reservoirHoldDepth) {
        setFlow(eid, direction, 0);
        continue;
      }

      const neighborHead = getTotalHydraulicHead(neighborEid);
      const headDelta = hydraulicHead - neighborHead;
      const previousFlow = getFlow(eid, direction);
      const rawCandidateFlow = Math.max(
        0,
        previousFlow +
          (deltaTimeSeconds * gravity * pipeArea * headDelta) / pipeLength,
      );
      const candidateFlow =
        isDamStructure(eid) && StructureComponent.dischargeCapacity[eid] > 0
          ? Math.min(rawCandidateFlow, StructureComponent.dischargeCapacity[eid])
          : rawCandidateFlow;

      setFlow(eid, direction, candidateFlow);
      outgoingFlowSum += candidateFlow;
    }

    const requestedOutflowVolume = outgoingFlowSum * deltaTimeSeconds;
    const scalingFactor =
      requestedOutflowVolume <= 0
        ? 1
        : Math.min(1, availableVolume / requestedOutflowVolume);
    let scaledOutflowSum = 0;

    for (let direction = 0; direction < directionCount; direction += 1) {
      const scaledFlow = getFlow(eid, direction) * scalingFactor;

      setFlow(eid, direction, scaledFlow);
      scaledOutflowSum += scaledFlow;

      if (scaledFlow > maxFlowCubicMetersPerSecond) {
        maxFlowCubicMetersPerSecond = scaledFlow;
      }
    }

    Water.outflow[eid] = scaledOutflowSum;
  }

  let totalWaterDepthMeters = 0;
  let maxWaterDepthMeters = 0;

  for (let index = 0; index < eids.length; index += 1) {
    const eid = eids[index];

    if (Terrain.active[eid] === 0) {
      continue;
    }

    const cellWidth = Math.max(
      Number.EPSILON,
      Terrain.cellWidth[eid] || constants.cellWidthMeters,
    );
    const cellHeight = Math.max(
      Number.EPSILON,
      Terrain.cellHeight[eid] || constants.cellHeightMeters,
    );
    const cellArea = cellWidth * cellHeight;
    let incomingFlowSum = 0;

    for (let direction = 0; direction < directionCount; direction += 1) {
      const neighborEid = getNeighborEid(input.topology, eid, direction);

      if (neighborEid === NO_NEIGHBOR || Terrain.active[neighborEid] === 0) {
        continue;
      }

      incomingFlowSum += getFlow(
        neighborEid,
        getOppositeDirection(input.topology, direction),
      );
    }

    const previousDepth = Math.max(0, Water.depth[eid]);
    const nextDepth = Math.max(
      minimumDepth,
      previousDepth +
        (deltaTimeSeconds * (incomingFlowSum - Water.outflow[eid])) / cellArea,
    );

    Water.previousDepth[eid] = Water.depth[eid];
    Water.inflow[eid] = incomingFlowSum;
    Water.depth[eid] = nextDepth;
    Water.hydraulicHead[eid] = getTotalHydraulicHead(eid);

    totalWaterDepthMeters += nextDepth;

    if (nextDepth > maxWaterDepthMeters) {
      maxWaterDepthMeters = nextDepth;
    }
  }

  return {
    totalWaterDepthMeters,
    maxWaterDepthMeters,
    maxFlowCubicMetersPerSecond,
  };
};
