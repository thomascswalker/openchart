import * as THREE from "three";
import type { MaterialSet, Rgb } from "./materials";
import { setMaterialStateForMaterial } from "./materials";
import { meshesInModel } from "./geometry";
import type { PrimitiveMaterialRole } from "./instances";
import type { Transform3D } from "./geometryCatalog";

export interface NoteInstanceData {
  x: number;
  y: number;
  z: number;
  color: Rgb;
  selected: boolean;
  priority?: number;
  tick: number;
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

export class NoteInstanceBatch {
  public meshes: THREE.InstancedMesh[] = [];
  public droppedNotes = 0;
  public capacity: number;
  public lastWriteMs = 0;
  private geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.ShaderMaterial[];
  private matrixAttribute!: THREE.InstancedBufferAttribute;
  private colorAttribute!: THREE.InstancedBufferAttribute;
  private tickAttribute!: THREE.InstancedBufferAttribute;
  private shrinkStartedAt: number | null = null;
  private readonly minimumCapacity: number;
  private readonly scale = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();

  public constructor(
    scene: THREE.Scene,
    template: THREE.Object3D,
    roles: readonly PrimitiveMaterialRole[],
    materialSet: Pick<MaterialSet, "noteTinted" | "noteGrayscale">,
    capacity: number,
    transform: Transform3D,
    renderOrder: number,
  ) {
    this.scene = scene;
    this.templateMeshes = meshesInModel(template);
    this.roles = roles;
    this.transform = transform;
    this.renderOrder = renderOrder;
    this.materials = [
      this.makeMaterial(materialSet.noteTinted, true),
      this.makeMaterial(materialSet.noteGrayscale, false),
    ];
    this.capacity = capacity;
    this.minimumCapacity = Math.min(capacity, INITIAL_CAPACITY);
    this.resize(this.minimumCapacity);
  }

  private readonly scene: THREE.Scene;
  private readonly templateMeshes: THREE.Mesh[];
  private readonly roles: readonly PrimitiveMaterialRole[];
  private readonly transform: Transform3D;
  private readonly renderOrder: number;

  private createMeshes(capacity: number): void {
    this.matrixAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 16),
      16,
    );
    this.matrixAttribute.setUsage(THREE.DynamicDrawUsage);
    const matrices = this.matrixAttribute.array as Float32Array;
    for (let index = 0; index < capacity; index += 1) {
      const offset = index * 16;
      matrices[offset] = 1;
      matrices[offset + 5] = 1;
      matrices[offset + 10] = 1;
      matrices[offset + 15] = 1;
    }
    this.colorAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 4),
      4,
    );
    this.colorAttribute.setUsage(THREE.DynamicDrawUsage);
    this.tickAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity),
      1,
    );
    this.tickAttribute.setUsage(THREE.DynamicDrawUsage);
    this.geometries = [];
    this.meshes = this.templateMeshes.map((templateMesh, index) => {
      templateMesh.updateWorldMatrix(true, false);
      const geometry = templateMesh.geometry.clone();
      geometry.applyMatrix4(templateMesh.matrixWorld);
      const transformMatrix = this.getTransformMatrix(this.transform);
      geometry.applyMatrix4(transformMatrix);
      geometry.setAttribute("aLaneColorSelected", this.colorAttribute);
      geometry.setAttribute("aStartTick", this.tickAttribute);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      this.geometries.push(geometry);
      const role = this.roles[index] ?? "neutral";
      const mesh = new THREE.InstancedMesh(
        geometry,
        role === "tinted" ? this.materials[0] : this.materials[1],
        capacity,
      );
      mesh.instanceMatrix = this.matrixAttribute;
      mesh.count = 0;
      mesh.renderOrder = this.renderOrder;
      mesh.frustumCulled = false;
      return mesh;
    });
    this.capacity = capacity;
  }

  private resize(capacity: number): void {
    this.meshes.forEach((mesh) => {
      mesh.removeFromParent();
      mesh.dispose();
    });
    this.geometries.forEach((geometry) => geometry.dispose());
    this.createMeshes(capacity);
    this.meshes.forEach((mesh) => this.scene.add(mesh));
  }

  public write(instances: readonly NoteInstanceData[]): number {
    const writeStartedAt = performance.now();
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
    const matrices = this.matrixAttribute.array as Float32Array;
    const colors = this.colorAttribute.array as Float32Array;
    const ticks = this.tickAttribute.array as Float32Array;
    let matrixStart = count;
    let matrixEnd = -1;
    let colorStart = count;
    let colorEnd = -1;
    let tickStart = count;
    let tickEnd = -1;
    for (let index = 0; index < count; index += 1) {
      const instance = ordered[index];
      const matrixOffset = index * 16;
      if (
        matrices[matrixOffset + 12] !== instance.x ||
        matrices[matrixOffset + 13] !== instance.y ||
        matrices[matrixOffset + 14] !== instance.z
      ) {
        matrices[matrixOffset + 12] = instance.x;
        matrices[matrixOffset + 13] = instance.y;
        matrices[matrixOffset + 14] = instance.z;
        matrixStart = Math.min(matrixStart, index);
        matrixEnd = index + 1;
      }
      const colorOffset = index * 4;
      let colorChanged = false;
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
      const selected = instance.selected ? 1 : 0;
      if (colors[colorOffset + 3] !== selected) {
        colors[colorOffset + 3] = selected;
        colorChanged = true;
      }
      if (colorChanged) {
        colorStart = Math.min(colorStart, index);
        colorEnd = index + 1;
      }
      if (ticks[index] !== instance.tick) {
        ticks[index] = instance.tick;
        tickStart = Math.min(tickStart, index);
        tickEnd = index + 1;
      }
    }
    this.meshes.forEach((mesh) => {
      mesh.count = count;
      mesh.visible = count > 0;
    });
    if (matrixEnd >= 0) {
      this.matrixAttribute.clearUpdateRanges();
      this.matrixAttribute.addUpdateRange(
        matrixStart * 16,
        (matrixEnd - matrixStart) * 16,
      );
      this.matrixAttribute.needsUpdate = true;
    }
    if (colorEnd >= 0) {
      this.colorAttribute.clearUpdateRanges();
      this.colorAttribute.addUpdateRange(
        colorStart * 4,
        (colorEnd - colorStart) * 4,
      );
      this.colorAttribute.needsUpdate = true;
    }
    if (tickEnd >= 0) {
      this.tickAttribute.clearUpdateRanges();
      this.tickAttribute.addUpdateRange(tickStart, tickEnd - tickStart);
      this.tickAttribute.needsUpdate = true;
    }
    this.lastWriteMs = performance.now() - writeStartedAt;
    return count;
  }

  public updateScroll(cameraTick: number, ppqn: number, nearBoardZ: number): void {
    for (const material of this.materials) {
      material.uniforms.uCameraTick.value = cameraTick;
      material.uniforms.uPpqn.value = ppqn;
      material.uniforms.uNearBoardZ.value = nearBoardZ;
    }
  }

  public dispose(): void {
    this.meshes.forEach((mesh) => {
      mesh.removeFromParent();
      mesh.dispose();
    });
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
  }

  private makeMaterial(
    source: THREE.ShaderMaterial,
    tinted: boolean,
  ): THREE.ShaderMaterial {
    const material = source.clone();
    material.defines = {
      ...material.defines,
      USE_INSTANCE_STATE: 1,
      USE_TICK_SCROLL: 1,
    };
    setMaterialStateForMaterial(material, { tint: tinted });
    material.needsUpdate = true;
    return material;
  }

  private getTransformMatrix(transform: Transform3D): THREE.Matrix4 {
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(transform.rotationDegrees.x),
      THREE.MathUtils.degToRad(transform.rotationDegrees.y),
      THREE.MathUtils.degToRad(transform.rotationDegrees.z),
    );
    this.rotation.setFromEuler(euler);
    this.scale.set(
      transform.scale.x,
      transform.scale.y,
      transform.scale.z,
    );
    return new THREE.Matrix4().compose(new THREE.Vector3(), this.rotation, this.scale);
  }
}
