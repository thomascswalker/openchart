import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  circularHighwayAssets,
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
      return Promise.reject(new RenderAssetLoadError("Asset registry disposed"));
    }
    if (this.highwayPromise) return this.highwayPromise;

    this.highwayPromise = Promise.all([
      this.loadModel(circularHighwayAssets.fretTopModel),
      this.loadModel(circularHighwayAssets.fretBaseModel),
      this.loadModel(circularHighwayAssets.noteModel),
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
        throw new RenderAssetLoadError("Unable to load circular highway assets", cause);
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

  private async loadModel(url: string): Promise<THREE.Group> {
    const gltf = await this.loader.loadAsync(url);
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
      [bundle.fretTop, circularHighwayPrimitiveRoles.fretTop, "highway.fretTop"],
      [bundle.fretBase, circularHighwayPrimitiveRoles.fretBase, "highway.fretBase"],
    ] as const;
    for (const [model, roles, id] of expected) {
      const meshes = meshesInObject(model).length;
      if (meshes > 0 && meshes !== roles.length) {
        throw new RenderAssetLoadError(
          `${id} primitive count ${meshes} does not match manifest role count ${roles.length}`,
        );
      }
    }
  }
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
