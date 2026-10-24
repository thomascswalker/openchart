import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import rawDefinitions from "../assets/defs.json";
import type {
  AssetDefinition,
  ResolvedAssetDefinition,
  ResolvedMaterialDefinition,
  ResolvedMeshDefinition,
} from "../assets";

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const assetUrls = import.meta.glob(
  [
    "../assets/**/*",
    "!../assets/Round/RoundNote_E2.png",
    "!../assets/Rect/RectNote.glb",
    "!../assets/Rect/RectNote_E.png",
  ],
  {
    eager: true,
    query: "?url",
    import: "default",
  },
) as Record<string, string>;
const declaredUnusedAssetUrls = import.meta.glob(
  [
    "../assets/Round/RoundNote_E2.png",
    "../assets/Rect/RectNote.glb",
    "../assets/Rect/RectNote_E.png",
  ],
  { query: "?url", import: "default" },
);
const shaderSources = import.meta.glob(
  "../components/views/highway/rendering/shaders/*.glsl",
  { eager: true, query: "?raw", import: "default" },
) as Record<string, string>;

export const assetDefinitions = rawDefinitions as AssetDefinition & {
  meshes: typeof rawDefinitions.meshes;
  materials: typeof rawDefinitions.materials;
};
export type MeshKey = keyof typeof rawDefinitions.meshes;
export type MaterialKey = keyof typeof rawDefinitions.materials;

function assetPath(root: string, file: string, definition: string): string {
  const normalizedRoot = root.replace(/^\.\//, "").replace(/\/$/, "");
  if (
    !root.startsWith("./") ||
    normalizedRoot.split("/").includes("..") ||
    !normalizedRoot ||
    file.includes("/") ||
    file === ".."
  ) {
    throw new AssetLoadError(
      `Definition "${definition}" has invalid root/file path "${root}/${file}".`,
    );
  }
  return `${normalizedRoot}/${file}`;
}

export function resolveAssetDefinitions(
  definitions: AssetDefinition,
  availableAssets: ReadonlySet<string>,
  shaderSourcesByName: Readonly<Record<string, string>>,
  resolveUrl: (path: string) => string,
): ResolvedAssetDefinition {
  if (
    !definitions ||
    !definitions.meshes ||
    !definitions.materials ||
    typeof definitions.meshes !== "object" ||
    typeof definitions.materials !== "object"
  ) {
    throw new AssetLoadError(
      'Asset definition must contain "meshes" and "materials" objects.',
    );
  }
  for (const [key, definition] of Object.entries(definitions.meshes)) {
    if (!definition || !definitions.materials[definition.material]) {
      throw new AssetLoadError(
        `Mesh definition "${key}" references missing material definition "${definition?.material}".`,
      );
    }
    if (
      typeof definition.root !== "string" ||
      (definition.mesh !== null && typeof definition.mesh !== "string") ||
      !Array.isArray(definition.materialIds) ||
      definition.materialIds.some((id) => typeof id !== "string") ||
      (definition.tintedMaterialIds !== undefined &&
        (!Array.isArray(definition.tintedMaterialIds) ||
          definition.tintedMaterialIds.some((id) => typeof id !== "string")))
    ) {
      throw new AssetLoadError(
        `Mesh definition "${key}" has an invalid schema.`,
      );
    }
  }

  const materials: Record<string, ResolvedMaterialDefinition> = {};
  for (const [key, definition] of Object.entries(definitions.materials)) {
    if (!definition || typeof definition.vert !== "string") {
      throw new AssetLoadError(
        `Material definition "${key}" has no vertex shader.`,
      );
    }
    if (typeof definition.pixel !== "string") {
      throw new AssetLoadError(
        `Material definition "${key}" has no pixel shader.`,
      );
    }
    const vertexShader = shaderSourcesByName[definition.vert];
    if (vertexShader === undefined) {
      throw new AssetLoadError(
        `Material definition "${key}" references missing shader "${definition.vert}".`,
      );
    }
    const fragmentShader = shaderSourcesByName[definition.pixel];
    if (fragmentShader === undefined) {
      throw new AssetLoadError(
        `Material definition "${key}" references missing shader "${definition.pixel}".`,
      );
    }
    if (
      !definition.properties ||
      typeof definition.properties !== "object" ||
      Array.isArray(definition.properties)
    ) {
      throw new AssetLoadError(
        `Material definition "${key}" properties must be an object.`,
      );
    }
    const properties: ResolvedMaterialDefinition["properties"] = {};
    for (const [name, value] of Object.entries(definition.properties ?? {})) {
      if (name.endsWith("Tex")) {
        if (!["diffuseTex", "emissionTex", "emissionMaskTex"].includes(name)) {
          throw new AssetLoadError(
            `Material definition "${key}" has unsupported texture property "${name}".`,
          );
        }
        if (typeof value !== "string") {
          throw new AssetLoadError(
            `Material definition "${key}" property "${name}" must name a texture file.`,
          );
        }
        const path = assetPath(
          findMaterialRoot(definitions, key),
          value,
          `material ${key}`,
        );
        if (!availableAssets.has(path)) {
          throw new AssetLoadError(
            `Material definition "${key}" property "${name}" references missing asset "${path}".`,
          );
        }
      } else if (
        (typeof value === "number" && Number.isFinite(value)) ||
        (Array.isArray(value) &&
          value.length === 3 &&
          value.every(
            (component) =>
              typeof component === "number" && Number.isFinite(component),
          ))
      ) {
        properties[name] = value as number | [number, number, number];
      } else {
        throw new AssetLoadError(
          `Material definition "${key}" property "${name}" must be a number, RGB tuple, or texture filename.`,
        );
      }
    }
    materials[key] = {
      key,
      definition,
      vertexShader,
      fragmentShader,
      properties,
    };
  }

  const meshes: Record<string, ResolvedMeshDefinition> = {};
  for (const [key, definition] of Object.entries(definitions.meshes)) {
    if (!definition || !definitions.materials[definition.material]) {
      throw new AssetLoadError(
        `Mesh definition "${key}" references missing material definition "${definition?.material}".`,
      );
    }
    const file = definition.mesh;
    const path =
      file === null ? null : assetPath(definition.root, file, `mesh ${key}`);
    if (path && !availableAssets.has(path)) {
      throw new AssetLoadError(
        `Mesh definition "${key}" references missing asset "${path}".`,
      );
    }
    if (file === null && definition.materialIds.length !== 0) {
      throw new AssetLoadError(
        `Mesh definition "${key}" has no GLB but declares material IDs.`,
      );
    }
    const tintedIds = definition.tintedMaterialIds ?? [];
    if (tintedIds.some((id) => !definition.materialIds.includes(id))) {
      throw new AssetLoadError(
        `Mesh definition "${key}" marks a tinted material ID that is not in materialIds.`,
      );
    }
    meshes[key] = {
      key,
      definition,
      url: path ? resolveUrl(path) : null,
    };
  }
  for (const path of Object.keys(definitions.unusedAssets ?? {})) {
    if (!availableAssets.has(path)) {
      throw new AssetLoadError(
        `Unused asset declaration references missing asset "${path}".`,
      );
    }
  }
  return { meshes, materials };
}

function findMaterialRoot(definitions: AssetDefinition, key: string): string {
  const mesh = Object.values(definitions.meshes).find(
    (entry) => entry.material === key,
  );
  if (!mesh) {
    throw new AssetLoadError(
      `Material definition "${key}" is not used by a mesh.`,
    );
  }
  return mesh.root;
}

export function validateMaterialSlotIds(
  meshKey: string,
  expectedIds: readonly string[],
  actualIds: readonly string[],
): void {
  const slotCount = Math.max(expectedIds.length, actualIds.length);
  for (let slot = 0; slot < slotCount; slot += 1) {
    const expected = expectedIds[slot];
    const actual = actualIds[slot];
    if (expected === undefined) {
      throw new AssetLoadError(
        `Mesh definition "${meshKey}" has extra GLB material slot ${slot}: "${actual}".`,
      );
    }
    if (actual === undefined) {
      throw new AssetLoadError(
        `Mesh definition "${meshKey}" is missing GLB material slot ${slot}: expected "${expected}".`,
      );
    }
    if (expected !== actual) {
      throw new AssetLoadError(
        `Mesh definition "${meshKey}" material slot ${slot} is "${actual}"; expected "${expected}".`,
      );
    }
  }
}

export class MeshResource {
  private _value?: THREE.Group;
  private _bounds?: THREE.Box3;
  public readonly definition: ResolvedMeshDefinition;

  public constructor(definition: ResolvedMeshDefinition) {
    this.definition = definition;
  }

  public get value(): THREE.Group | undefined {
    return this._value;
  }

  public get bounds(): THREE.Box3 | undefined {
    return this._bounds?.clone();
  }

  public get meshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    this._value?.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    return meshes;
  }

  public async load(): Promise<THREE.Group> {
    if (!this.definition.url) {
      throw new AssetLoadError(
        `Mesh definition "${this.definition.key}" has no GLB asset.`,
      );
    }
    const gltf = await gltfLoader.loadAsync(this.definition.url);
    this._value = gltf.scene;
    this._value.updateMatrixWorld(true);
    this._bounds = new THREE.Box3().setFromObject(this._value);
    const actualIds: string[] = [];
    for (const mesh of this.meshes) {
      const slots = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of slots) {
        if (!actualIds.includes(material.name)) actualIds.push(material.name);
      }
    }
    validateMaterialSlotIds(
      this.definition.key,
      this.definition.definition.materialIds,
      actualIds,
    );
    return this._value;
  }

  public release(): void {
    this._value?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];
      materials.forEach((material) => material.dispose());
    });
    this._value = undefined;
    this._bounds = undefined;
  }
}

export class TextureResource {
  private _value?: THREE.Texture;
  public readonly path: string;
  private readonly url: string;
  private readonly colorSpace: THREE.ColorSpace;

  public constructor(path: string, url: string, colorSpace: THREE.ColorSpace) {
    this.path = path;
    this.url = url;
    this.colorSpace = colorSpace;
  }

  public get value(): THREE.Texture | undefined {
    return this._value;
  }

  public async load(): Promise<THREE.Texture> {
    this._value = await textureLoader.loadAsync(this.url);
    this._value.colorSpace = this.colorSpace;
    this._value.flipY = false;
    return this._value;
  }

  public release(): void {
    this._value?.dispose();
    this._value = undefined;
  }
}

export class AssetLoadError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AssetLoadError";
  }
}

export class ResourceRegistry {
  private readonly resolved: ResolvedAssetDefinition;
  private readonly meshResources = new Map<string, MeshResource>();
  private readonly textureResources = new Map<string, TextureResource>();
  private isDisposed = false;
  private loadPromise: Promise<void> | null = null;

  public constructor() {
    const availableAssets = new Set(
      [...Object.keys(assetUrls), ...Object.keys(declaredUnusedAssetUrls)].map(
        (path) => path.replace("../assets/", ""),
      ),
    );
    const sourcesByName = Object.fromEntries(
      Object.entries(shaderSources).map(([path, source]) => [
        path.split("/").at(-1)!,
        source,
      ]),
    );
    this.resolved = resolveAssetDefinitions(
      assetDefinitions,
      availableAssets,
      sourcesByName,
      (path) => {
        const url = assetUrls[`../assets/${path}`];
        if (!url) throw new AssetLoadError(`Asset not found: "${path}".`);
        return url;
      },
    );
    for (const mesh of Object.values(this.resolved.meshes)) {
      if (mesh.url) this.meshResources.set(mesh.key, new MeshResource(mesh));
    }
    for (const material of Object.values(this.resolved.materials)) {
      for (const [property, value] of Object.entries(
        material.definition.properties,
      )) {
        if (typeof value !== "string" || !property.endsWith("Tex")) continue;
        const mesh = Object.values(assetDefinitions.meshes).find(
          (entry) => entry.material === material.key,
        );
        if (!mesh) continue;
        const path = assetPath(mesh.root, value, `material ${material.key}`);
        let resource = this.textureResources.get(path);
        if (!resource) {
          const url = assetUrls[`../assets/${path}`];
          if (!url) {
            throw new AssetLoadError(
              `Material definition "${material.key}" references missing asset "${path}".`,
            );
          }
          resource = new TextureResource(
            path,
            url,
            property === "emissionMaskTex"
              ? THREE.NoColorSpace
              : THREE.SRGBColorSpace,
          );
          this.textureResources.set(path, resource);
        }
        material.properties[property] = resource;
      }
    }
  }

  public loadResources(): Promise<void> {
    if (this.isDisposed) {
      return Promise.reject(new AssetLoadError("Resource registry disposed."));
    }
    if (this.loadPromise) return this.loadPromise;
    const loads = [
      ...this.meshResources.values(),
      ...this.textureResources.values(),
    ].map((resource) => resource.load());
    this.loadPromise = Promise.all(loads)
      .then(() => {
        if (this.isDisposed) {
          throw new AssetLoadError(
            "Resource registry disposed during loading.",
          );
        }
      })
      .catch(async (error: unknown) => {
        await Promise.allSettled(loads);
        this.releaseResources();
        this.loadPromise = null;
        if (error instanceof AssetLoadError) throw error;
        throw new AssetLoadError("Unable to load highway assets.", {
          cause: error,
        });
      });
    return this.loadPromise;
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.releaseResources();
  }

  public getMesh(key: MeshKey): MeshResource {
    const mesh = this.meshResources.get(key);
    if (!mesh) {
      throw new AssetLoadError(`Mesh definition "${key}" has no GLB resource.`);
    }
    return mesh;
  }

  public getMaterial(key: MaterialKey): ResolvedMaterialDefinition {
    const material = this.resolved.materials[key];
    if (!material)
      throw new AssetLoadError(`Unknown material definition "${key}".`);
    return material;
  }

  public get materials(): Record<string, ResolvedMaterialDefinition> {
    return this.resolved.materials;
  }

  private releaseResources(): void {
    this.meshResources.forEach((resource) => resource.release());
    this.textureResources.forEach((resource) => resource.release());
  }
}
