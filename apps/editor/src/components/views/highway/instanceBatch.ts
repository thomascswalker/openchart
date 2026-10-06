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
}

export class NoteInstanceBatch {
  public readonly meshes: THREE.InstancedMesh[];
  private readonly geometries: THREE.BufferGeometry[];
  private readonly materials: THREE.ShaderMaterial[];
  private readonly matrixAttribute: THREE.InstancedBufferAttribute;
  private readonly colorAttribute: THREE.InstancedBufferAttribute;
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly matrix = new THREE.Matrix4();

  public constructor(
    scene: THREE.Scene,
    template: THREE.Object3D,
    roles: readonly PrimitiveMaterialRole[],
    materialSet: Pick<MaterialSet, "noteTinted" | "noteGrayscale">,
    capacity: number,
    transform: Transform3D,
    renderOrder: number,
  ) {
    const templateMeshes = meshesInModel(template);
    this.matrixAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 16),
      16,
    );
    this.matrixAttribute.setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 4),
      4,
    );
    this.colorAttribute.setUsage(THREE.DynamicDrawUsage);
    this.materials = [
      this.makeMaterial(materialSet.noteTinted, true),
      this.makeMaterial(materialSet.noteGrayscale, false),
    ];
    this.geometries = [];
    this.meshes = templateMeshes.map((templateMesh, index) => {
      templateMesh.updateWorldMatrix(true, false);
      const geometry = templateMesh.geometry.clone();
      geometry.applyMatrix4(templateMesh.matrixWorld);
      const transformMatrix = this.getTransformMatrix(transform);
      geometry.applyMatrix4(transformMatrix);
      geometry.setAttribute("aLaneColorSelected", this.colorAttribute);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      this.geometries.push(geometry);
      const role = roles[index] ?? "neutral";
      const mesh = new THREE.InstancedMesh(
        geometry,
        role === "tinted" ? this.materials[0] : this.materials[1],
        capacity,
      );
      mesh.instanceMatrix = this.matrixAttribute;
      mesh.count = 0;
      mesh.renderOrder = renderOrder;
      mesh.frustumCulled = false;
      scene.add(mesh);
      return mesh;
    });
  }

  public write(instances: readonly NoteInstanceData[]): number {
    const capacity = this.matrixAttribute.count;
    const count = Math.min(instances.length, capacity);
    const matrices = this.matrixAttribute.array as Float32Array;
    const colors = this.colorAttribute.array as Float32Array;
    for (let index = 0; index < count; index += 1) {
      const instance = instances[index];
      this.position.set(instance.x, instance.y, instance.z);
      this.scale.set(1, 1, 1);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.matrix.toArray(matrices, index * 16);
      const colorOffset = index * 4;
      colors[colorOffset] = instance.color[0];
      colors[colorOffset + 1] = instance.color[1];
      colors[colorOffset + 2] = instance.color[2];
      colors[colorOffset + 3] = instance.selected ? 1 : 0;
    }
    this.meshes.forEach((mesh) => {
      mesh.count = count;
      mesh.visible = count > 0;
    });
    this.matrixAttribute.clearUpdateRanges();
    this.matrixAttribute.addUpdateRange(0, count * 16);
    this.matrixAttribute.needsUpdate = true;
    this.colorAttribute.clearUpdateRanges();
    this.colorAttribute.addUpdateRange(0, count * 4);
    this.colorAttribute.needsUpdate = true;
    return count;
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
    material.defines = { ...material.defines, USE_INSTANCE_STATE: 1 };
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
