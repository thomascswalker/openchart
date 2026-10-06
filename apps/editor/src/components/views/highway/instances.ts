import * as THREE from "three";
import type { MeshDefinition } from "../../../assets";
import {
  setMaterialStateForMaterial,
  type MaterialState,
  type Rgb,
} from "./materials";
import { applyGeometryModelTransform, meshesInModel } from "./geometry";
import type { Transform3D } from "./geometryCatalog";

export type PrimitiveMaterialRole = "tinted" | "neutral";
type MaterialSource =
  THREE.Material | ((primitiveIndex: number) => THREE.Material);

function cloneModelMeshes(
  template: THREE.Object3D,
  material: MaterialSource,
): { object: THREE.Group; meshes: THREE.Mesh[] } {
  const object = new THREE.Group();
  let primitiveIndex = 0;
  const meshes = meshesInModel(template).map((templateMesh) => {
    const templateMaterials = Array.isArray(templateMesh.material)
      ? templateMesh.material
      : [templateMesh.material];
    const meshMaterials = templateMaterials.map(() =>
      typeof material === "function" ? material(primitiveIndex++) : material,
    );
    const mesh = templateMesh.clone();
    mesh.material =
      meshMaterials.length === 1 ? meshMaterials[0] : meshMaterials;
    templateMesh.updateWorldMatrix(true, false);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(templateMesh.matrixWorld);
    object.add(mesh);
    return mesh;
  });
  return { object, meshes };
}

export function primitiveRolesForModel(
  template: THREE.Object3D,
  definition: MeshDefinition,
): PrimitiveMaterialRole[] {
  const declaredIds = new Set(definition.materialIds);
  const tintedIds = new Set(definition.tintedMaterialIds ?? []);
  return meshesInModel(template).flatMap((mesh) => {
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    return materials.map((material) => {
      if (!declaredIds.has(material.name)) {
        throw new Error(
          `Mesh definition material "${material.name}" is not declared for this model.`,
        );
      }
      return tintedIds.has(material.name) ? "tinted" : "neutral";
    });
  });
}

export interface InstancedNote {
  object: THREE.Group;
  meshes: THREE.Mesh[];
  selected: boolean;
}

export function createModelInstance(
  template: THREE.Object3D,
  material: MaterialSource,
  transform: Transform3D,
): InstancedNote {
  const { object, meshes } = cloneModelMeshes(template, material);
  applyGeometryModelTransform(object, transform);
  object.visible = false;
  return { object, meshes, selected: false };
}

export function createFretAssembly(
  scene: THREE.Scene,
  template: THREE.Object3D,
  material: THREE.Material,
  laneColor: Rgb,
  primitiveRoles: readonly PrimitiveMaterialRole[],
  neutralMaterial: THREE.Material,
  transform: Transform3D,
): THREE.Group {
  const assembly = new THREE.Group();
  const { object, meshes } = cloneModelMeshes(template, (primitiveIndex) =>
    primitiveRoles[primitiveIndex] === "tinted"
      ? material.clone()
      : neutralMaterial.clone(),
  );
  applyGeometryModelTransform(object, transform);
  applyPrimitiveMaterialStates(meshes, primitiveRoles, (role) => ({
    baseColor: laneColor,
    emissionColor: role === "neutral" ? [1, 1, 1] : laneColor,
    tint: role === "tinted",
  }));
  assembly.add(object);
  scene.add(assembly);
  return assembly;
}

function applyPrimitiveMaterialStates(
  meshes: THREE.Mesh[],
  primitiveRoles: readonly PrimitiveMaterialRole[],
  stateForRole: (role: PrimitiveMaterialRole) => Partial<MaterialState>,
): void {
  let primitiveIndex = 0;
  meshes.forEach((mesh) => {
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    materials.forEach((material) => {
      const role = primitiveRoles[primitiveIndex++] ?? "neutral";
      setMaterialStateForMaterial(material, stateForRole(role));
    });
  });
}

export function modelMeshesForBounds(instance: InstancedNote): THREE.Mesh[] {
  return instance.meshes.length
    ? instance.meshes
    : meshesInModel(instance.object);
}
