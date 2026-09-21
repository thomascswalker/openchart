import * as THREE from "three";
import {
  setCircularMaterialState,
  setCircularMaterialStateForMaterial,
  type MaterialSet,
  type CircularMaterialState,
  type Rgb,
} from "./circularMaterials";
import {
  applyModelCalibration,
  meshesInModel,
  type ModelCalibration,
} from "./highwayGeometry";

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

export interface PooledNote {
  object: THREE.Group;
  meshes: THREE.Mesh[];
  selected: boolean;
}

export interface PooledTail {
  mesh: THREE.Mesh;
}

export function visiblePoolItems<T extends { start: number; end: number }>(
  items: readonly T[],
  visibleStart: number,
  visibleEnd: number,
  poolSize: number,
): T[] {
  return items
    .filter((item) => item.end >= visibleStart && item.start <= visibleEnd)
    .slice(0, poolSize);
}

export function createModelInstance(
  template: THREE.Object3D,
  material: MaterialSource,
  calibration?: ModelCalibration,
): PooledNote {
  const { object, meshes } = cloneModelMeshes(template, material);
  if (calibration) applyModelCalibration(object, calibration);
  object.visible = false;
  return { object, meshes, selected: false };
}

export function createNotePools(
  scene: THREE.Scene,
  template: THREE.Object3D,
  materialSet: MaterialSet,
  colors: Rgb[],
  poolSize: number,
  calibration: ModelCalibration,
  primitiveRoles: readonly PrimitiveMaterialRole[] = [],
): PooledNote[][] {
  return colors.map((color) => {
    const pool: PooledNote[] = [];
    for (let index = 0; index < poolSize; index++) {
      const note = createModelInstance(
        template,
        (primitiveIndex) =>
          primitiveRoles[primitiveIndex] === "tinted"
            ? materialSet.noteTinted.clone()
            : materialSet.noteGrayscale.clone(),
        calibration,
      );
      applyPrimitiveMaterialStates(note.meshes, primitiveRoles, (role) => ({
        baseColor: color,
        emissionColor: role === "neutral" ? [1, 1, 1] : color,
        tint: role === "tinted",
      }));
      scene.add(note.object);
      pool.push(note);
    }
    return pool;
  });
}

export function createFretAssembly(
  scene: THREE.Scene,
  topTemplate: THREE.Object3D,
  baseTemplate: THREE.Object3D,
  material: THREE.Material,
  laneColor: Rgb,
  topPrimitiveRoles: readonly PrimitiveMaterialRole[] = [],
  neutralMaterial: THREE.Material = material,
  basePrimitiveRoles: readonly PrimitiveMaterialRole[] = topPrimitiveRoles,
): THREE.Group {
  const assembly = new THREE.Group();
  const parts = [
    { template: baseTemplate, primitiveRoles: basePrimitiveRoles },
    { template: topTemplate, primitiveRoles: topPrimitiveRoles },
  ];
  parts.forEach(({ template, primitiveRoles }) => {
    const { object, meshes } = cloneModelMeshes(template, (primitiveIndex) =>
      primitiveRoles[primitiveIndex] === "tinted"
        ? material.clone()
        : neutralMaterial.clone(),
    );
    applyPrimitiveMaterialStates(meshes, primitiveRoles, (role) => ({
      baseColor: laneColor,
      emissionColor: role === "neutral" ? [1, 1, 1] : laneColor,
      tint: role === "tinted",
    }));
    assembly.add(object);
  });
  scene.add(assembly);
  return assembly;
}

function applyPrimitiveMaterialStates(
  meshes: THREE.Mesh[],
  primitiveRoles: readonly PrimitiveMaterialRole[],
  stateForRole: (role: PrimitiveMaterialRole) => Partial<CircularMaterialState>,
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
      setCircularMaterialStateForMaterial(material, stateForRole(role));
    });
  });
}

export function createSustainPool(
  scene: THREE.Scene,
  material: THREE.Material,
  colors: Rgb[],
  poolSize: number,
): PooledTail[][] {
  return colors.map((color) => {
    const pool: PooledTail[] = [];
    for (let index = 0; index < poolSize; index++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        material.clone(),
      );
      mesh.rotation.x = THREE.MathUtils.degToRad(90);
      mesh.visible = false;
      setCircularMaterialState(mesh, {
        baseColor: color,
        emissionColor: color,
        alpha: 0.65,
        tint: true,
        useStrikeLine: true,
        strikeLineZ: -3.5,
      });
      scene.add(mesh);
      pool.push({ mesh });
    }
    return pool;
  });
}

export function destroyPooledObjects(
  pools: PooledNote[][],
  tails: PooledTail[][],
): void {
  pools.flat().forEach(({ object }) => {
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

export function modelMeshesForBounds(pool: PooledNote): THREE.Mesh[] {
  return pool.meshes.length ? pool.meshes : meshesInModel(pool.object);
}
