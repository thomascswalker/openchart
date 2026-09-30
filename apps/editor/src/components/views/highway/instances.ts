import * as THREE from "three";
import type { MeshDefinition } from "../../../assets";
import {
  setMaterialState,
  setMaterialStateForMaterial,
  type MaterialSet,
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

export interface InstancedTail {
  mesh: THREE.Mesh;
}

export function visibleInstanceItems<T extends { start: number; end: number }>(
  items: readonly T[],
  visibleStart: number,
  visibleEnd: number,
  instanceSize: number,
): T[] {
  return items
    .filter((item) => item.end >= visibleStart && item.start <= visibleEnd)
    .slice(0, instanceSize);
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

export function createNoteInstances(
  scene: THREE.Scene,
  template: THREE.Object3D,
  materialSet: Pick<MaterialSet, "noteTinted" | "noteGrayscale">,
  colors: Rgb[],
  instanceSize: number,
  transform: Transform3D,
  primitiveRoles: readonly PrimitiveMaterialRole[] = [],
): InstancedNote[][] {
  return colors.map((color) => {
    const instance: InstancedNote[] = [];
    for (let index = 0; index < instanceSize; index++) {
      const note = createModelInstance(
        template,
        (primitiveIndex) =>
          primitiveRoles[primitiveIndex] === "tinted"
            ? materialSet.noteTinted.clone()
            : materialSet.noteGrayscale.clone(),
        transform,
      );
      applyPrimitiveMaterialStates(note.meshes, primitiveRoles, (role) => ({
        baseColor: color,
        emissionColor: role === "neutral" ? [1, 1, 1] : color,
        tint: role === "tinted",
      }));
      scene.add(note.object);
      instance.push(note);
    }
    return instance;
  });
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

export function createSustainInstance(
  scene: THREE.Scene,
  material: THREE.Material,
  colors: Rgb[],
  instanceSize: number,
): InstancedTail[][] {
  return colors.map((color) => {
    const instance: InstancedTail[] = [];
    for (let index = 0; index < instanceSize; index++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        material.clone(),
      );
      mesh.rotation.x = THREE.MathUtils.degToRad(90);
      mesh.visible = false;
      setMaterialState(mesh, {
        baseColor: color,
        emissionColor: color,
        alpha: 0.65,
        tint: true,
        useStrikeLine: true,
        strikeLineZ: -3.5,
      });
      scene.add(mesh);
      instance.push({ mesh });
    }
    return instance;
  });
}

export function destroyInstancedObjects(
  instances: InstancedNote[][],
  tails: InstancedTail[][],
): void {
  instances.flat().forEach(({ object }) => {
    object.removeFromParent();
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];
      materials.forEach((material) => material.dispose());
    });
  });
  tails.flat().forEach(({ mesh }) => {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    materials.forEach((material) => material.dispose());
  });
}

export function modelMeshesForBounds(instance: InstancedNote): THREE.Mesh[] {
  return instance.meshes.length
    ? instance.meshes
    : meshesInModel(instance.object);
}
