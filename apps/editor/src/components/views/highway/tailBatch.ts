import * as THREE from "three";
import { minimumSustainLengthTicks } from "./interaction";
import {
  setMaterialStateForMaterial,
  type MaterialState,
  type Rgb,
} from "./materials";

export interface SustainInstanceData {
  x: number;
  y: number;
  z: number;
  width: number;
  halfLength: number;
  color: Rgb;
  selected: boolean;
  priority?: number;
  startTick: number;
  endTick: number;
}

const INITIAL_CAPACITY = 256;
const MAX_CAPACITY = 16_384;
const SHRINK_DELAY_MS = 5_000;

function expandedCapacity(current: number, needed: number): number {
  let capacity = current;
  while (capacity < needed && capacity < MAX_CAPACITY) {
    capacity = Math.min(MAX_CAPACITY, capacity * 2);
  }
  return capacity;
}

export class SustainTailBatch {
  public mesh!: THREE.InstancedMesh;
  public capacity: number;
  public droppedNotes = 0;
  public lastWriteMs = 0;
  private geometry!: THREE.PlaneGeometry;
  private readonly material: THREE.ShaderMaterial;
  private colors!: THREE.InstancedBufferAttribute;
  private tickRanges!: THREE.InstancedBufferAttribute;
  private shrinkStartedAt: number | null = null;
  private readonly scene: THREE.Scene;
  private readonly renderOrder: number;
  private readonly minimumCapacity: number;
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    Math.PI / 2,
  );
  private readonly matrix = new THREE.Matrix4();

  public constructor(
    scene: THREE.Scene,
    material: THREE.ShaderMaterial,
    capacity: number,
    renderOrder: number,
    state: Partial<MaterialState>,
  ) {
    this.scene = scene;
    this.renderOrder = renderOrder;
    this.material = material.clone();
    this.material.defines = {
      ...this.material.defines,
      USE_INSTANCE_STATE: 1,
      USE_TAIL_TICK_SCROLL: 1,
    };
    setMaterialStateForMaterial(this.material, state);
    this.material.needsUpdate = true;
    this.capacity = capacity;
    this.minimumCapacity = Math.min(capacity, INITIAL_CAPACITY);
    this.resize(this.minimumCapacity);
  }

  private resize(capacity: number): void {
    if (this.mesh) {
      this.mesh.removeFromParent();
      this.mesh.dispose();
      this.geometry.dispose();
    }
    this.geometry = new THREE.PlaneGeometry(2, 2);
    this.colors = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 4),
      4,
    );
    this.colors.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("aLaneColorSelected", this.colors);
    this.tickRanges = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 2),
      2,
    );
    this.tickRanges.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("aTickRange", this.tickRanges);
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.count = 0;
    this.mesh.renderOrder = this.renderOrder;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.capacity = capacity;
    this.scene.add(this.mesh);
  }

  public write(instances: readonly SustainInstanceData[]): number {
    const writeStartedAt = performance.now();
    const renderableInstances = instances.filter(
      (instance) =>
        instance.endTick - instance.startTick >= minimumSustainLengthTicks,
    );
    const needed = Math.min(renderableInstances.length, MAX_CAPACITY);
    if (needed > this.capacity) {
      this.resize(expandedCapacity(this.capacity, needed));
      this.shrinkStartedAt = null;
    } else if (
      needed < this.capacity * 0.25 &&
      this.capacity > this.minimumCapacity
    ) {
      const now = performance.now();
      this.shrinkStartedAt ??= now;
      if (now - this.shrinkStartedAt >= SHRINK_DELAY_MS) {
        this.resize(Math.max(this.minimumCapacity, this.capacity / 2));
        this.shrinkStartedAt = now;
      }
    } else {
      this.shrinkStartedAt = null;
    }

    const count = Math.min(renderableInstances.length, this.capacity);
    this.droppedNotes = renderableInstances.length - count;
    const ordered =
      count < renderableInstances.length
        ? [...renderableInstances].sort(
            (left, right) => (left.priority ?? 0) - (right.priority ?? 0),
          )
        : renderableInstances;
    const colors = this.colors.array as Float32Array;
    const tickRanges = this.tickRanges.array as Float32Array;
    const matrices = this.mesh.instanceMatrix.array as Float32Array;
    let matrixStart = count;
    let matrixEnd = -1;
    let colorStart = count;
    let colorEnd = -1;
    let tickStart = count;
    let tickEnd = -1;
    for (let index = 0; index < count; index += 1) {
      const instance = ordered[index];
      this.position.set(instance.x, instance.y, instance.z);
      this.scale.set(instance.width, 1, 1);
      this.matrix.compose(this.position, this.rotation, this.scale);
      const matrixOffset = index * 16;
      let matrixChanged = false;
      for (let component = 0; component < 16; component += 1) {
        const value = Math.fround(this.matrix.elements[component]);
        if (matrices[matrixOffset + component] !== value) {
          matrices[matrixOffset + component] = value;
          matrixChanged = true;
        }
      }
      if (matrixChanged) {
        matrixStart = Math.min(matrixStart, index);
        matrixEnd = index + 1;
      }
      const colorOffset = index * 4;
      let colorChanged = false;
      const selected = instance.selected ? 1 : 0;
      if (colors[colorOffset] !== instance.color[0]) {
        colors[colorOffset] = instance.color[0];
        colorChanged = true;
      }
      if (colors[colorOffset + 1] !== instance.color[1]) {
        colors[colorOffset + 1] = instance.color[1];
        colorChanged = true;
      }
      if (colors[colorOffset + 2] !== instance.color[2]) {
        colors[colorOffset + 2] = instance.color[2];
        colorChanged = true;
      }
      if (colors[colorOffset + 3] !== selected) {
        colors[colorOffset + 3] = selected;
        colorChanged = true;
      }
      if (colorChanged) {
        colorStart = Math.min(colorStart, index);
        colorEnd = index + 1;
      }
      const rangeOffset = index * 2;
      if (
        tickRanges[rangeOffset] !== instance.startTick ||
        tickRanges[rangeOffset + 1] !== instance.endTick
      ) {
        tickRanges[rangeOffset] = instance.startTick;
        tickRanges[rangeOffset + 1] = instance.endTick;
        tickStart = Math.min(tickStart, index);
        tickEnd = index + 1;
      }
    }
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    if (matrixEnd >= 0) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(
        matrixStart * 16,
        (matrixEnd - matrixStart) * 16,
      );
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    if (colorEnd >= 0) {
      this.colors.clearUpdateRanges();
      this.colors.addUpdateRange(colorStart * 4, (colorEnd - colorStart) * 4);
      this.colors.needsUpdate = true;
    }
    if (tickEnd >= 0) {
      this.tickRanges.clearUpdateRanges();
      this.tickRanges.addUpdateRange(tickStart * 2, (tickEnd - tickStart) * 2);
      this.tickRanges.needsUpdate = true;
    }
    this.lastWriteMs = performance.now() - writeStartedAt;
    return count;
  }

  public updateScroll(
    cameraTick: number,
    ppqn: number,
    nearBoardZ: number,
  ): void {
    this.material.uniforms.uCameraTick.value = cameraTick;
    this.material.uniforms.uPpqn.value = ppqn;
    this.material.uniforms.uNearBoardZ.value = nearBoardZ;
  }

  public dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
