import * as THREE from "three";
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
  private geometry!: THREE.PlaneGeometry;
  private readonly material: THREE.ShaderMaterial;
  private colors!: THREE.InstancedBufferAttribute;
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
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.count = 0;
    this.mesh.renderOrder = this.renderOrder;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.capacity = capacity;
    this.scene.add(this.mesh);
  }

  public write(instances: readonly SustainInstanceData[]): number {
    const needed = Math.min(instances.length, MAX_CAPACITY);
    if (needed > this.capacity) {
      this.resize(expandedCapacity(this.capacity, needed));
      this.shrinkStartedAt = null;
    } else if (needed < this.capacity * 0.25 && this.capacity > this.minimumCapacity) {
      const now = performance.now();
      this.shrinkStartedAt ??= now;
      if (now - this.shrinkStartedAt >= SHRINK_DELAY_MS) {
        this.resize(Math.max(this.minimumCapacity, this.capacity / 2));
        this.shrinkStartedAt = now;
      }
    } else {
      this.shrinkStartedAt = null;
    }

    const count = Math.min(instances.length, this.capacity);
    this.droppedNotes = instances.length - count;
    const ordered =
      count < instances.length
        ? [...instances].sort(
            (left, right) =>
              (left.priority ?? 0) - (right.priority ?? 0),
          )
        : instances;
    const colors = this.colors.array as Float32Array;
    for (let index = 0; index < count; index += 1) {
      const instance = ordered[index];
      this.position.set(instance.x, instance.y, instance.z);
      this.scale.set(instance.width, instance.halfLength, 1);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(index, this.matrix);
      const colorOffset = index * 4;
      colors[colorOffset] = instance.color[0];
      colors[colorOffset + 1] = instance.color[1];
      colors[colorOffset + 2] = instance.color[2];
      colors[colorOffset + 3] = instance.selected ? 1 : 0;
    }
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colors.clearUpdateRanges();
    this.colors.addUpdateRange(0, count * 4);
    this.colors.needsUpdate = true;
    return count;
  }

  public dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}