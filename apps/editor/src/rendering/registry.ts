import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const assets = {
  /* Fret */
  fretTopMesh: new URL("../assets/fret/FretTop.glb", import.meta.url).href,
  fretBaseMesh: new URL("../assets/fret/FretBase.glb", import.meta.url).href,
  fretColor: new URL("../assets/fret/Fret.png", import.meta.url).href,

  /* Note */
  noteMesh: new URL("../assets/note/Note.glb", import.meta.url).href,
  noteColor: new URL("../assets/note/Note.png", import.meta.url).href,
  noteEmission: new URL("../assets/note/NoteEmission.png", import.meta.url)
    .href,

  /* Sustain */
  sustainColor: new URL("../assets/note/Sustain.png", import.meta.url).href,
  sustainEmission: new URL(
    "../assets/note/SustainEmission.png",
    import.meta.url,
  ).href,
} as const;

export type AssetUrls = typeof assets;

export const materialIds = {
  note: [
    "Circular_Note_Top",
    "Circular_Note_Color",
    "Circular_Note_Indicator",
    "Circular_Note_Bottom",
  ],
  fretTop: [
    "Note_Tap.034",
    "Note_Color_Yellow",
    "Note_Bottom.048",
    "Note_SIde.020",
  ],
  fretBase: ["Note_Color_Yellow", "Note_Tap.034"],
} as const;

export interface Textures {
  fret: THREE.Texture;
  note: THREE.Texture;
  noteEmission: THREE.Texture;
  sustain: THREE.Texture;
  sustainEmission: THREE.Texture;
}

export const primitiveRoles = {
  note: ["neutral", "tinted", "neutral", "neutral"],
  fretTop: ["neutral", "tinted", "neutral", "neutral"],
  fretBase: ["tinted", "neutral"],
} as const;

export interface Bundle {
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

  private bundle: Bundle | null = null;
  private isLoaded = false;
  private disposed = false;

  public async loadAssets(): Promise<Bundle> {
    if (this.disposed) {
      return Promise.reject(new AssetLoadError("Asset registry disposed"));
    }

    if (this.isLoaded && this.bundle !== null) {
      return Promise.resolve(this.bundle);
    }

    try {
      const [fretTop, fretBase, note, textures] = await Promise.all([
        this.loadModel(assets.fretTopMesh, materialIds.fretTop),
        this.loadModel(assets.fretBaseMesh, materialIds.fretBase),
        this.loadModel(assets.noteMesh, materialIds.note),
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

  private validatePrimitiveRoles(bundle: Bundle): void {
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
