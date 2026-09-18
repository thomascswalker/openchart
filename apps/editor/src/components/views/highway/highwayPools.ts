import { Container3D, Mesh3D, Model, type Material } from "pixi3d/pixi7";
import type { Rgb, CircularMaterialSet } from "./circularMaterials";
import { setCircularMaterialState } from "./circularMaterials";
import {
  applyModelCalibration,
  meshesInModel,
  type ModelCalibration,
} from "./highwayGeometry";

export type PrimitiveMaterialRole = "tinted" | "neutral";
type MaterialSource = Material | ((primitiveIndex: number) => Material);

// pixi3d's Model.createInstance()/Mesh3D.createInstance() rely on the source
// mesh remaining in the scene graph so its own render pass can batch its
// InstancedMesh3D children, and on the source material supporting hardware
// instancing (StandardMaterial only). Our custom, non-instanced shader
// materials (and the fact that our fret/note templates are never added to
// the scene) mean instances created that way never actually render. Instead,
// build independent Mesh3D copies that reuse the template's geometry and get
// their own draw call with the real material assigned up front.
function cloneModelMeshes(
  template: Model,
  material: MaterialSource,
): { object: Container3D; meshes: Mesh3D[] } {
  const object = new Container3D();
  const meshes = meshesInModel(template).map((templateMesh, index) => {
    const meshMaterial =
      typeof material === "function" ? material(index) : material;
    const mesh = new Mesh3D(templateMesh.geometry, meshMaterial);
    object.addChild(mesh);
    return mesh;
  });
  return { object, meshes };
}

export interface PooledNote {
  object: Container3D;
  meshes: Mesh3D[];
  selected: boolean;
}

export interface PooledTail {
  mesh: Mesh3D;
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
  template: Model,
  material: MaterialSource,
  calibration?: ModelCalibration,
): PooledNote {
  const { object, meshes } = cloneModelMeshes(template, material);
  if (calibration) {
    applyModelCalibration(object, calibration);
  }
  object.visible = false;
  return { object, meshes, selected: false };
}

export function createNotePools(
  scene: Container3D,
  template: Model,
  materialSet: CircularMaterialSet,
  colors: Rgb[],
  poolSize: number,
  calibration: ModelCalibration,
  primitiveRoles: readonly PrimitiveMaterialRole[] = [],
): PooledNote[][] {
  return colors.map((color) => {
    const pool: PooledNote[] = [];
    for (let i = 0; i < poolSize; i += 1) {
      const note = createModelInstance(
        template,
        (primitiveIndex) =>
          primitiveRoles[primitiveIndex] === "tinted"
            ? materialSet.noteColor
            : materialSet.noteNeutral,
        calibration,
      );
      note.meshes.forEach((mesh, primitiveIndex) =>
        setCircularMaterialState(mesh, {
          baseColor: color,
          emissionColor:
            primitiveRoles[primitiveIndex] === "neutral"
              ? ([1, 1, 1] as Rgb)
              : color,
          tint: primitiveRoles[primitiveIndex] !== "neutral",
        }),
      );
      scene.addChild(note.object);
      pool.push(note);
    }
    return pool;
  });
}

export function createFretAssembly(
  scene: Container3D,
  topTemplate: Model,
  baseTemplate: Model,
  material: Material,
  laneColor: Rgb,
  topPrimitiveRoles: readonly PrimitiveMaterialRole[] = [],
  neutralMaterial: Material = material,
  basePrimitiveRoles: readonly PrimitiveMaterialRole[] = topPrimitiveRoles,
): Container3D {
  const assembly = new Container3D();
  const parts: ReadonlyArray<{
    template: Model;
    primitiveRoles: readonly PrimitiveMaterialRole[];
  }> = [
    { template: baseTemplate, primitiveRoles: basePrimitiveRoles },
    { template: topTemplate, primitiveRoles: topPrimitiveRoles },
  ];
  parts.forEach(({ template, primitiveRoles }) => {
    const { object, meshes } = cloneModelMeshes(template, (primitiveIndex) =>
      primitiveRoles[primitiveIndex] === "tinted" ? material : neutralMaterial,
    );
    meshes.forEach((mesh, primitiveIndex) =>
      setCircularMaterialState(mesh, {
        baseColor: laneColor,
        emissionColor:
          primitiveRoles[primitiveIndex] === "neutral"
            ? ([1, 1, 1] as Rgb)
            : laneColor,
        tint: primitiveRoles[primitiveIndex] !== "neutral",
      }),
    );
    assembly.addChild(object);
  });
  scene.addChild(assembly);
  return assembly;
}

export function createSustainPool(
  scene: Container3D,
  material: Material,
  colors: Rgb[],
  poolSize: number,
): PooledTail[][] {
  return colors.map((color) => {
    const pool: PooledTail[] = [];
    for (let i = 0; i < poolSize; i += 1) {
      const mesh = Mesh3D.createQuad(material);
      mesh.rotationQuaternion.setEulerAngles(90, 0, 0);
      setCircularMaterialState(mesh, {
        baseColor: color,
        emissionColor: color,
        alpha: 0.65,
      });
      mesh.visible = false;
      scene.addChild(mesh);
      pool.push({ mesh });
    }
    return pool;
  });
}

export function destroyPooledObjects(
  pools: PooledNote[][],
  tails: PooledTail[][],
): void {
  pools.flat().forEach(({ object }) =>
    object.destroy({
      children: true,
      geometry: false,
      material: false,
      texture: false,
      baseTexture: false,
    } as never),
  );
  tails.flat().forEach(({ mesh }) =>
    mesh.destroy({
      children: true,
      geometry: true,
      material: false,
      texture: false,
      baseTexture: false,
    } as never),
  );
}

export function modelMeshesForBounds(pool: PooledNote): Mesh3D[] {
  return pool.meshes.length ? pool.meshes : meshesInModel(pool.object);
}
