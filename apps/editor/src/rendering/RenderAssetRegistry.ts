import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  circularHighwayAssets,
  circularHighwayMaterialAssignments,
  circularHighwayPrimitiveRoles,
  type CircularHighwayTextures,
} from "../assets/highway/circular";

export interface HighwayAssetBundle {
  fretTop: THREE.Group;
  fretBase: THREE.Group;
  note: THREE.Group;
  textures: CircularHighwayTextures;
}

export class RenderAssetLoadError extends Error {
  public readonly cause?: unknown;

  public constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
    this.name = "RenderAssetLoadError";
  }
}

/** Application-lifetime owner for immutable Three templates and textures. */
export class RenderAssetRegistry {
  private highwayPromise: Promise<HighwayAssetBundle> | null = null;
  private highwayBundle: HighwayAssetBundle | null = null;
  private disposed = false;
  private readonly loader = new GLTFLoader();

  public preloadHighway(): Promise<HighwayAssetBundle> {
    if (this.disposed) {
      return Promise.reject(
        new RenderAssetLoadError("Asset registry disposed"),
      );
    }
    if (this.highwayPromise) return this.highwayPromise;

    this.highwayPromise = Promise.all([
      this.loadModel(
        circularHighwayAssets.fretTopModel,
        circularHighwayMaterialAssignments.fretTop,
      ),
      this.loadModel(
        circularHighwayAssets.fretBaseModel,
        circularHighwayMaterialAssignments.fretBase,
      ),
      this.loadModel(
        circularHighwayAssets.noteModel,
        circularHighwayMaterialAssignments.note,
      ),
      this.loadTextures(),
    ])
      .then(([fretTop, fretBase, note, textures]) => {
        if (this.disposed) {
          disposeObject(fretTop);
          disposeObject(fretBase);
          disposeObject(note);
          Object.values(textures).forEach((texture) => texture.dispose());
          throw new RenderAssetLoadError("Asset registry disposed during load");
        }
        const bundle = { fretTop, fretBase, note, textures };
        this.validatePrimitiveRoles(bundle);
        this.highwayBundle = bundle;
        return bundle;
      })
      .catch((cause) => {
        this.highwayPromise = null;
        if (cause instanceof RenderAssetLoadError) throw cause;
        throw new RenderAssetLoadError(
          "Unable to load circular highway assets",
          cause,
        );
      });

    return this.highwayPromise;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const bundle = this.highwayBundle;
    this.highwayBundle = null;
    this.highwayPromise = null;
    if (!bundle) return;
    disposeObject(bundle.fretTop);
    disposeObject(bundle.fretBase);
    disposeObject(bundle.note);
    Object.values(bundle.textures).forEach((texture) => texture.dispose());
  }

  private async loadModel(
    url: string,
    expectedMaterials: readonly string[],
  ): Promise<THREE.Group> {
    const gltf = await this.loader.loadAsync(url);
    const meshes = meshesInObject(gltf.scene);
    const materials = meshes.flatMap((mesh) =>
      Array.isArray(mesh.material) ? mesh.material : [mesh.material],
    );
    if (materials.length !== expectedMaterials.length) {
      throw new RenderAssetLoadError(
        `${url} has ${materials.length} material slots; expected ${expectedMaterials.length}`,
      );
    }
    materials.forEach((material, index) => {
      const expectedMaterial = expectedMaterials[index];
      if (!material || !matchesMaterialName(material.name, expectedMaterial)) {
        throw new RenderAssetLoadError(
          `${url} primitive ${index} material ${material?.name ?? "missing"} does not match ${expectedMaterial}`,
        );
      }
      material.name = expectedMaterial;
    });
    return gltf.scene;
  }

  private async loadTextures(): Promise<CircularHighwayTextures> {
    const loader = new THREE.TextureLoader();
    const [fret, note, noteEmission, sustain, sustainEmission] =
      await Promise.all([
        loader.loadAsync(circularHighwayAssets.fretTexture),
        loader.loadAsync(circularHighwayAssets.noteTexture),
        loader.loadAsync(circularHighwayAssets.noteEmissionTexture),
        loader.loadAsync(circularHighwayAssets.sustainTexture),
        loader.loadAsync(circularHighwayAssets.sustainEmissionTexture),
      ]);
    [fret, note, noteEmission, sustain, sustainEmission].forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
    });
    return { fret, note, noteEmission, sustain, sustainEmission };
  }

  private validatePrimitiveRoles(bundle: HighwayAssetBundle): void {
    const expected = [
      [bundle.note, circularHighwayPrimitiveRoles.note, "highway.note"],
      [
        bundle.fretTop,
        circularHighwayPrimitiveRoles.fretTop,
        "highway.fretTop",
      ],
      [
        bundle.fretBase,
        circularHighwayPrimitiveRoles.fretBase,
        "highway.fretBase",
      ],
    ] as const;
    for (const [model, roles, id] of expected) {
      const materials = meshesInObject(model).flatMap((mesh) =>
        Array.isArray(mesh.material) ? mesh.material : [mesh.material],
      );
      if (materials.length > 0 && materials.length !== roles.length) {
        throw new RenderAssetLoadError(
          `${id} material slot count ${materials.length} does not match manifest role count ${roles.length}`,
        );
      }
    }
  }
}

function matchesMaterialName(actual: string, expected: string): boolean {
  if (actual === expected) return true;
  const suffix = actual.slice(expected.length);
  return suffix.startsWith(".") && /^\.\d+$/.test(suffix);
}

export function meshesInObject(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    materials.forEach((material) => material.dispose());
  });
}
