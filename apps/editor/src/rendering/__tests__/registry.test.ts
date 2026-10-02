import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { AssetDefinition } from "../../assets";
import type { ResolvedTextureResource } from "../../assets";
import {
  AssetLoadError,
  ResourceRegistry,
  assetDefinitions,
  resolveAssetDefinitions,
  validateMaterialSlotIds,
  type MeshKey,
} from "../registry";

const shaderSources = {
  "vert.glsl": "vertex source",
  "note.frag.glsl": "note fragment source",
  "solid.frag.glsl": "solid fragment source",
};

afterEach(() => vi.restoreAllMocks());

function mockSceneForUrl(
  url: string,
  registry: ResourceRegistry,
  disposedGeometries: THREE.BufferGeometry[],
): THREE.Group {
  const meshEntry = Object.entries(assetDefinitions.meshes).find(
    ([key, definition]) =>
      definition.mesh !== null &&
      registry.getMesh(key as MeshKey).definition.url === url,
  );
  const definition = meshEntry?.[1];
  const model = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.addEventListener("dispose", () => disposedGeometries.push(geometry));
  const materials = (definition?.materialIds ?? []).map((name) => {
    const material = new THREE.MeshBasicMaterial();
    material.name = name;
    return material;
  });
  model.add(new THREE.Mesh(geometry, materials));
  return model;
}

function resolvedTexture(
  value:
    number | [number, number, number] | ResolvedTextureResource | undefined,
): ResolvedTextureResource | undefined {
  return value && typeof value === "object" && "path" in value
    ? value
    : undefined;
}

function referencedAssetPaths(definitions: AssetDefinition): Set<string> {
  const paths = new Set<string>();
  for (const mesh of Object.values(definitions.meshes)) {
    if (mesh.mesh) paths.add(`${mesh.root.replace(/^\.\//, "")}/${mesh.mesh}`);
  }
  for (const [materialKey, material] of Object.entries(definitions.materials)) {
    const mesh = Object.values(definitions.meshes).find(
      (entry) => entry.material === materialKey,
    );
    if (!mesh) continue;
    for (const value of Object.values(material.properties)) {
      if (typeof value === "string") {
        paths.add(`${mesh.root.replace(/^\.\//, "")}/${value}`);
      }
    }
  }
  Object.keys(definitions.unusedAssets ?? {}).forEach((path) =>
    paths.add(path),
  );
  return paths;
}

function resolve(
  definitions: AssetDefinition,
  paths = referencedAssetPaths(definitions),
) {
  return resolveAssetDefinitions(
    definitions,
    paths,
    shaderSources,
    (path) => `/assets/${path}`,
  );
}

describe("asset definition resolution", () => {
  it("resolves every mesh root and shader-backed material", () => {
    const resolved = resolve(assetDefinitions);

    expect(Object.keys(resolved.meshes).sort()).toEqual(
      ["cymbalNote", "fret", "kickNote", "roundNote", "sustain"].sort(),
    );
    expect(resolved.meshes.cymbalNote.url).toBe(
      "/assets/Cymbal/CymbalNote.glb",
    );
    expect(resolved.meshes.fret.url).toBe("/assets/Fret/Fret.glb");
    expect(resolved.meshes.kickNote.url).toBe("/assets/Kick/KickNote.glb");
    expect(resolved.meshes.roundNote.url).toBe("/assets/Round/RoundNote.glb");
    expect(resolved.meshes.sustain.url).toBeNull();
    expect(resolved.materials.sustain.fragmentShader).toBe(
      shaderSources["solid.frag.glsl"],
    );
  });

  it("reports a missing asset with its mesh definition", () => {
    const paths = referencedAssetPaths(assetDefinitions);
    paths.delete("Round/RoundNote.glb");

    expect(() => resolve(assetDefinitions, paths)).toThrow(
      'Mesh definition "roundNote" references missing asset "Round/RoundNote.glb"',
    );
  });

  it("reports a missing material texture with its definition and property", () => {
    const paths = referencedAssetPaths(assetDefinitions);
    paths.delete("Round/RoundNote_E.png");

    expect(() => resolve(assetDefinitions, paths)).toThrow(
      'Material definition "roundNote" property "emissionTex" references missing asset "Round/RoundNote_E.png"',
    );
  });

  it("rejects a mesh that refers to an undefined material", () => {
    const definitions = structuredClone(assetDefinitions);
    definitions.meshes.roundNote.material = "missingMaterial";

    expect(() => resolve(definitions)).toThrow(
      'Mesh definition "roundNote" references missing material definition "missingMaterial"',
    );
  });

  it("keeps the alternate round emission map documented but unused", () => {
    const resolved = resolve(assetDefinitions);
    const referenced = [...Object.values(assetDefinitions.materials)].flatMap(
      (material) => Object.values(material.properties),
    );

    expect(assetDefinitions.unusedAssets?.["Round/RoundNote_E2.png"]).toMatch(
      /intentionally unused/i,
    );
    expect(referenced).not.toContain("RoundNote_E2.png");
    expect(
      resolved.materials.roundNote.properties.emissionMaskTex,
    ).toBeUndefined();
  });
});

describe("GLB material slot validation", () => {
  it("accepts matching named slots and reports missing, extra, and mismatched slots", () => {
    expect(() =>
      validateMaterialSlotIds("roundNote", ["Top", "Color"], ["Top", "Color"]),
    ).not.toThrow();
    expect(() => validateMaterialSlotIds("roundNote", ["Top"], [])).toThrow(
      'Mesh definition "roundNote" is missing GLB material slot 0',
    );
    expect(() => validateMaterialSlotIds("roundNote", [], ["Extra"])).toThrow(
      'Mesh definition "roundNote" has extra GLB material slot 0',
    );
    expect(() =>
      validateMaterialSlotIds("roundNote", ["Color"], ["Top"]),
    ).toThrow(
      'Mesh definition "roundNote" material slot 0 is "Top"; expected "Color"',
    );
  });
});

describe("registry resource ownership", () => {
  it("loads each unique model and texture once and disposes registry-owned data", async () => {
    const registry = new ResourceRegistry();
    const disposedGeometries: THREE.BufferGeometry[] = [];
    const disposedTextures: THREE.Texture[] = [];
    const meshLoad = vi
      .spyOn(GLTFLoader.prototype, "loadAsync")
      .mockImplementation(
        async (url) =>
          ({
            scene: mockSceneForUrl(url, registry, disposedGeometries),
          }) as never,
      );
    const textureLoad = vi
      .spyOn(THREE.TextureLoader.prototype, "loadAsync")
      .mockImplementation(async () => {
        const texture = new THREE.Texture();
        texture.addEventListener("dispose", () =>
          disposedTextures.push(texture),
        );
        return texture;
      });

    const firstLoad = registry.loadResources();
    const concurrentLoad = registry.loadResources();
    expect(concurrentLoad).toBe(firstLoad);
    await firstLoad;

    expect(meshLoad).toHaveBeenCalledTimes(4);
    expect(textureLoad).toHaveBeenCalledTimes(8);
    expect(registry.getMesh("roundNote")).toBe(registry.getMesh("roundNote"));
    expect(registry.getMesh("roundNote").bounds).toBeInstanceOf(THREE.Box3);
    const emissionTexture = resolvedTexture(
      registry.getMaterial("roundNote").properties.emissionTex,
    );
    const maskTexture = resolvedTexture(
      registry.getMaterial("roundNote").properties.emissionMaskTex,
    );
    expect(emissionTexture?.value).toBeInstanceOf(THREE.Texture);
    expect(emissionTexture?.value?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(maskTexture?.value?.colorSpace).toBe(THREE.NoColorSpace);

    registry.dispose();
    expect(disposedGeometries).toHaveLength(4);
    expect(disposedTextures).toHaveLength(8);
  });

  it("releases assets that finish loading after registry disposal", async () => {
    const registry = new ResourceRegistry();
    const disposedGeometries: THREE.BufferGeometry[] = [];
    let releaseLoads!: () => void;
    const loadGate = new Promise<void>((resolveGate) => {
      releaseLoads = resolveGate;
    });
    vi.spyOn(GLTFLoader.prototype, "loadAsync").mockImplementation(
      async (url) => {
        await loadGate;
        return {
          scene: mockSceneForUrl(url, registry, disposedGeometries),
        } as never;
      },
    );
    vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(
      new THREE.Texture(),
    );

    const loading = registry.loadResources();
    registry.dispose();
    releaseLoads();

    await expect(loading).rejects.toBeInstanceOf(AssetLoadError);
    expect(registry.getMesh("roundNote").value).toBeUndefined();
    expect(disposedGeometries).toHaveLength(4);
  });

  it("wraps a failed browser asset request with a registry error", async () => {
    const registry = new ResourceRegistry();
    vi.spyOn(GLTFLoader.prototype, "loadAsync").mockRejectedValue(
      new Error("network unavailable"),
    );
    vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(
      new THREE.Texture(),
    );

    await expect(registry.loadResources()).rejects.toThrow(
      "Unable to load highway assets.",
    );
    registry.dispose();
  });
});
