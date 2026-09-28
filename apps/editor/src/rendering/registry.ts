import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as resources from "./resources.json";

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const assetUrls = import.meta.glob("../assets/**/*", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function assetUrl(path: string): string {
  const url = assetUrls[`../assets/${path}`];
  if (!url) {
    throw new AssetLoadError(`Asset not found: ${path}`);
  }
  return url;
}

type ResourceType = "mesh" | "texture";

interface MeshDef {
  type: ResourceType;
  path: string;
  materialIds: string[];
}

interface TextureDef {
  type: ResourceType;
  path: string;
}

abstract class Resource<T> {
  protected path: string;
  protected _value?: T;

  constructor(path: string) {
    this.path = path;
  }

  public get value(): T | undefined {
    return this._value;
  }

  public get url(): string {
    return assetUrl(this.path);
  }

  public abstract load(): Promise<T>;
  public abstract release(): void;
}

export class MeshResource extends Resource<THREE.Group> {
  constructor(path: string) {
    super(path);
  }

  public get meshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    this._value?.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        meshes.push(object);
      }
    });
    return meshes;
  }

  public async load(): Promise<THREE.Group> {
    const gltf = await gltfLoader.loadAsync(this.url);
    this._value = gltf.scene;
    return Promise.resolve(this._value);
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
  }
}

export class TextureResource extends Resource<THREE.Texture> {
  constructor(path: string) {
    super(path);
  }

  public async load(): Promise<THREE.Texture> {
    this._value = await textureLoader.loadAsync(this.url);
    if (!this._value) {
      return Promise.reject("Unable to load texture.");
    }
    this._value.colorSpace = THREE.SRGBColorSpace;
    return this._value;
  }

  public release(): void {
    this._value?.dispose();
  }
}

export class AssetLoadError extends Error {
  public readonly cause?: string;

  public constructor(message: string, cause?: string) {
    super(message);
    this.cause = cause;
    this.name = "RenderAssetLoadError";
  }
}

export class ResourceRegistry {
  private resources: Record<string, MeshResource | TextureResource> = {};
  private isLoaded = false;
  private isDisposed = false;

  public async loadResources(): Promise<void> {
    if (this.isDisposed) {
      return Promise.reject(new AssetLoadError("Resource registry disposed"));
    }

    if (this.isLoaded) {
      return Promise.resolve();
    }

    this.resources = {};

    const loads = Object.entries(resources).map(([key, value]) => {
      switch (value["type"]) {
        case "mesh":
          const meshDef = value as MeshDef;
          const meshResource = new MeshResource(meshDef.path);
          this.resources[key] = meshResource;
          return meshResource.load();
        case "texture":
          const textureDef = value as TextureDef;
          const textureResource = new TextureResource(textureDef.path);
          this.resources[key] = textureResource;
          return textureResource.load();
      }
    });
    await Promise.all(loads);
    this.isLoaded = true;
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.isLoaded = false;
    Object.values(this.resources).forEach((resource) => resource.release());
  }

  public get meshes(): Record<string, MeshResource> {
    return {
      fretTop: this.resources.fretTopMesh as MeshResource,
      fretBase: this.resources.fretBaseMesh as MeshResource,
      note: this.resources.noteMesh as MeshResource,
      kick: this.resources.kickMesh as MeshResource,
      cymbal: this.resources.cymbalMesh as MeshResource,
      pad: this.resources.padMesh as MeshResource,
    };
  }

  public get textures(): Record<string, TextureResource> {
    return {
      fret: this.resources.fretColor as TextureResource,
      note: this.resources.noteColor as TextureResource,
      kickNote: this.resources.kickNoteColor as TextureResource,
      cymbalNote: this.resources.cymbalNoteColor as TextureResource,
      padNote: this.resources.padNoteColor as TextureResource,
      noteEmission: this.resources.noteEmission as TextureResource,
      noteEmissionMask: this.resources.noteEmissionMask as TextureResource,
      sustain: this.resources.sustainColor as TextureResource,
      sustainEmission: this.resources.sustainEmission as TextureResource,
    };
  }

  public getMesh(name: string): MeshResource | undefined {
    const resource = this.resources[name];
    if (resource instanceof MeshResource) {
      return resource;
    }
    throw new Error(`Resource ${name} is not a mesh.`);
  }

  public getTexture(name: string): TextureResource | undefined {
    const resource = this.resources[name];
    if (resource instanceof TextureResource) {
      return resource;
    }
    throw new Error(`Resource ${name} is not a texture.`);
  }
}

export const primitiveRoles = {
  note: ["neutral", "tinted", "neutral", "neutral"],
  fretTop: ["neutral", "tinted", "neutral", "neutral"],
  fretBase: ["tinted", "neutral"],
} as const;
