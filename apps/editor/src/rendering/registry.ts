import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  assets,
  materialAssignments,
  primitiveRoles,
  type Textures,
} from "../assets/meshes";

export interface AssetBundle {
  fretTop: THREE.Group;
  fretBase: THREE.Group;
  note: THREE.Group;
  textures: Textures;
}

export class AssetLoadError extends Error {
  public readonly cause?: string;

  public constructor(message: string, cause?: string) {
    super(message);
    this.cause = cause;
    this.name = "RenderAssetLoadError";
  }
}

export class AssetRegistry {
  private readonly loader = new GLTFLoader();

  private bundle: AssetBundle | null = null;
  private isLoaded = false;
  private disposed = false;

  public async loadAssets(): Promise<AssetBundle> {
    if (this.disposed) {
      return Promise.reject(new AssetLoadError("Asset registry disposed"));
    }
    if (this.isLoaded) {
      return Promise.resolve(this.bundle);
    }

    try {
      const [fretTop, fretBase, note, textures] = await Promise.all([
        this.loadModel(assets.fretTopMesh, materialAssignments.fretTop),
        this.loadModel(assets.fretBaseMesh, materialAssignments.fretBase),
        this.loadModel(assets.noteMesh, materialAssignments.note),
        this.loadTextures(),
      ]);
      if (this.disposed) {
        disposeObject(fretTop);
        disposeObject(fretBase);
        disposeObject(note);
        Object.values(textures).forEach((texture) => texture.dispose());
        throw new AssetLoadError("Asset registry disposed during load");
      }
      const bundle = { fretTop, fretBase, note, textures };
      this.validatePrimitiveRoles(bundle);
      this.bundle = bundle;
      this.isLoaded = true;
      return Promise.resolve(bundle);
    } catch (cause) {
      this.isLoaded = false;
      if (cause instanceof AssetLoadError) {
        throw cause;
      }
      throw new AssetLoadError(
        "Unable to load circular highway assets",
        String(cause),
      );
    }
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const bundle = this.bundle;
    this.bundle = null;
    this.isLoaded = false;
    if (!bundle) {
      return;
    }
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
      throw new AssetLoadError(
        `${url} has ${materials.length} material slots; expected ${expectedMaterials.length}`,
      );
    }
    materials.forEach((material, index) => {
      const expectedMaterial = expectedMaterials[index];
      if (!material || !matchesMaterialName(material.name, expectedMaterial)) {
        throw new AssetLoadError(
          `${url} primitive ${index} material ${material?.name ?? "missing"} does not match ${expectedMaterial}`,
        );
      }
      material.name = expectedMaterial;
    });
    return gltf.scene;
  }

  private async loadTextures(): Promise<Textures> {
    const loader = new THREE.TextureLoader();
    const [fret, note, noteEmission, sustain, sustainEmission] =
      await Promise.all([
        loader.loadAsync(assets.fretColor),
        loader.loadAsync(assets.noteColor),
        loader.loadAsync(assets.noteEmission),
        loader.loadAsync(assets.sustainColor),
        loader.loadAsync(assets.sustainEmission),
      ]);
    [fret, note, noteEmission, sustain, sustainEmission].forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
    });
    return { fret, note, noteEmission, sustain, sustainEmission };
  }

  private validatePrimitiveRoles(bundle: AssetBundle): void {
    const expected = [
      [bundle.note, primitiveRoles.note, "highway.note"],
      [bundle.fretTop, primitiveRoles.fretTop, "highway.fretTop"],
      [bundle.fretBase, primitiveRoles.fretBase, "highway.fretBase"],
    ] as const;
    for (const [model, roles, id] of expected) {
      const materials = meshesInObject(model).flatMap((mesh) =>
        Array.isArray(mesh.material) ? mesh.material : [mesh.material],
      );
      if (materials.length > 0 && materials.length !== roles.length) {
        throw new AssetLoadError(
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
