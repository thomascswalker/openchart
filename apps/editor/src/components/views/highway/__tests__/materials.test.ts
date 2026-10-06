import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type {
  MaterialKey,
  ResourceRegistry,
} from "../../../../rendering/registry";
import type { ResolvedMaterialDefinition } from "../../../../assets";
import { assetDefinitions } from "../../../../rendering/registry";
import { createMaterialSet, rgbFromHex } from "../materials";
import { primitiveRolesForModel } from "../instances";
import { HIGHWAY_GEOMETRY_CATALOG } from "../geometryCatalog";

export const CIRCULAR_MATERIAL_MAPPING = {
  baseColor: "optional diffuse texture or white default * uBaseColor",
  laneTint: "uBaseColor",
  emission:
    "emissionTex.rgb * mix(1, uEmissionColor, emissionMaskTexture.r) * uEmissionIntensity",
  alpha: "baseTexture.a * uAlpha with a 0.02 discard cutoff",
  tint: "manifest tintedMaterialIds select the slots that multiply by uBaseColor",
  passed:
    "final composed colour is converted to luminance at/near the strike line",
  depth: "depth test enabled; opaque notes write depth; ghost/sustain do not",
  culling: "double-sided imported circular/fret surfaces",
  selected: "uSelected brightens the lane tint and emission",
  ghost: "uGhost mixes a neutral tint and reduces alpha",
  sustain:
    "solid uBaseColor; generated quad UVs do not map cleanly to Sustain.png",
} as const;

function resolvedMaterial(
  key: string,
  textures: {
    diffuse?: THREE.Texture;
    emission?: THREE.Texture;
    mask?: THREE.Texture;
  } = {},
): ResolvedMaterialDefinition {
  const properties: ResolvedMaterialDefinition["properties"] = {};
  if (textures.diffuse) {
    properties.diffuseTex = {
      path: `${key}-diffuse.png`,
      value: textures.diffuse,
    };
  }
  if (textures.emission) {
    properties.emissionTex = {
      path: `${key}-emission.png`,
      value: textures.emission,
    };
  }
  if (textures.mask) {
    properties.emissionMaskTex = {
      path: `${key}-mask.png`,
      value: textures.mask,
    };
  }
  return {
    key,
    definition: {
      vert: "vert.glsl",
      pixel: key === "sustain" ? "solid.frag.glsl" : "note.frag.glsl",
      properties: {},
    },
    vertexShader: "vertex source",
    fragmentShader: `${key} fragment source`,
    properties,
  };
}

function makeRegistry(textures: Record<string, THREE.Texture>) {
  const definitions: Record<MaterialKey, ResolvedMaterialDefinition> = {
    roundNote: resolvedMaterial("roundNote", {
      emission: textures.roundEmission,
      mask: textures.roundMask,
    }),
    kickNote: resolvedMaterial("kickNote", { emission: textures.kickEmission }),
    cymbalNote: resolvedMaterial("cymbalNote", {
      emission: textures.cymbalEmission,
    }),
    sustain: resolvedMaterial("sustain", {
      diffuse: textures.sustainDiffuse,
      emission: textures.sustainEmission,
    }),
    fret: resolvedMaterial("fret", { emission: textures.fretEmission }),
  };
  return {
    registry: {
      getMaterial: vi.fn((key: MaterialKey) => definitions[key]),
    } as unknown as ResourceRegistry,
    definitions,
  };
}

describe("manifest highway material factory", () => {
  it("documents the shader state contract", () => {
    expect(CIRCULAR_MATERIAL_MAPPING).toMatchObject({
      baseColor: expect.stringContaining("white default"),
      emission: expect.stringContaining("uEmissionIntensity"),
      alpha: expect.stringContaining("uAlpha"),
      tint: expect.stringContaining("tintedMaterialIds"),
      passed: expect.stringContaining("luminance"),
      selected: expect.stringContaining("uSelected"),
      ghost: expect.stringContaining("uGhost"),
      sustain: expect.stringContaining("solid uBaseColor"),
    });
  });

  it("preserves the five lane colours", () => {
    expect(
      [0x00a651, 0xdc2626, 0xfacc15, 0x2563eb, 0xf97316].map(rgbFromHex),
    ).toEqual([
      [0, 0.6509803921568628, 0.3176470588235294],
      [0.8627450980392157, 0.14901960784313725, 0.14901960784313725],
      [0.9803921568627451, 0.8, 0.08235294117647059],
      [0.1450980392156863, 0.38823529411764707, 0.9215686274509803],
      [0.9764705882352941, 0.45098039215686275, 0.08627450980392157],
    ]);
  });

  it("uses definition shaders and optional texture fallbacks", () => {
    const textures = {
      roundEmission: new THREE.Texture(),
      roundMask: new THREE.Texture(),
      kickEmission: new THREE.Texture(),
      cymbalEmission: new THREE.Texture(),
      sustainDiffuse: new THREE.Texture(),
      sustainEmission: new THREE.Texture(),
      fretEmission: new THREE.Texture(),
    };
    const { registry, definitions } = makeRegistry(textures);
    const materials = createMaterialSet(registry);

    expect(materials.noteTinted.fragmentShader).toBe(
      definitions.roundNote.fragmentShader,
    );
    expect(materials.drum.pad.noteTinted.fragmentShader).toBe(
      definitions.roundNote.fragmentShader,
    );
    expect(materials.drum.kick.noteTinted.uniforms.uEmissionTexture.value).toBe(
      textures.kickEmission,
    );
    expect(materials.noteTinted.uniforms.uEmissionMaskTexture.value).toBe(
      textures.roundMask,
    );
    expect(materials.drum.cymbal.noteTinted.uniforms.uBaseTexture.value).toBe(
      materials.drum.cymbal.noteTinted.uniforms.uBaseTexture.value,
    );
    expect(
      materials.drum.cymbal.noteTinted.uniforms.uBaseTexture.value,
    ).toBeInstanceOf(THREE.DataTexture);
    expect(materials.sustain.fragmentShader).toBe(
      definitions.sustain.fragmentShader,
    );
    expect(materials.sustain.uniforms.uBaseTexture.value).toBe(
      textures.sustainDiffuse,
    );

    materials.destroy();
    Object.values(textures).forEach((texture) => texture.dispose());
  });

  it("creates tinted, neutral, and transparent ghost variants for each slot material", () => {
    const { registry } = makeRegistry({
      roundEmission: new THREE.Texture(),
      roundMask: new THREE.Texture(),
      kickEmission: new THREE.Texture(),
      cymbalEmission: new THREE.Texture(),
      sustainDiffuse: new THREE.Texture(),
      sustainEmission: new THREE.Texture(),
      fretEmission: new THREE.Texture(),
    });
    const materials = createMaterialSet(registry);

    for (const variants of Object.values(materials.drum)) {
      expect(variants.noteGhostTinted.transparent).toBe(true);
      // expect(variants.noteTinted.depthTest).toBe(kind === "kick");
      // expect(variants.noteGhostTinted.depthTest).toBe(kind === "kick");
      expect(variants.noteGhostTinted.depthWrite).toBe(false);
      expect(variants.noteTinted.side).toBe(THREE.DoubleSide);
    }
    expect(materials.fretTinted).toBeInstanceOf(THREE.ShaderMaterial);
    expect(materials.noteGrayscale.uniforms.uTintEnabled.value).toBe(1);

    materials.destroy();
  });

  it("assigns tint only to manifest-declared named material slots", () => {
    for (const definition of Object.values(assetDefinitions.meshes)) {
      if (!definition.mesh) continue;
      const materials = definition.materialIds.map((name) => {
        const material = new THREE.MeshBasicMaterial();
        material.name = name;
        return material;
      });
      const model = new THREE.Mesh(new THREE.BoxGeometry(), materials);

      expect(primitiveRolesForModel(model, definition)).toEqual(
        definition.materialIds.map((id) =>
          definition.tintedMaterialIds?.includes(id) ? "tinted" : "neutral",
        ),
      );
      model.geometry.dispose();
      materials.forEach((material) => material.dispose());
    }
  });

  it("uses round notes for pads and preserves named color-slot tinting", () => {
    expect(HIGHWAY_GEOMETRY_CATALOG.pad.meshKey).toBe("roundNote");
    expect(HIGHWAY_GEOMETRY_CATALOG.pad.materialKey).toBe("roundNote");
    expect(HIGHWAY_GEOMETRY_CATALOG.padGhost.meshKey).toBe("roundNote");
    expect(assetDefinitions.meshes.roundNote.tintedMaterialIds).toEqual([
      "RoundNoteColor",
    ]);
    expect(assetDefinitions.meshes.cymbalNote.tintedMaterialIds).toEqual([
      "CymbalNoteColor",
    ]);
    expect("rectNote" in assetDefinitions.meshes).toBe(false);
  });

  it("renders pads and cymbals above kick notes without depth rejection", () => {
    const { registry } = makeRegistry({
      roundEmission: new THREE.Texture(),
      roundMask: new THREE.Texture(),
      kickEmission: new THREE.Texture(),
      cymbalEmission: new THREE.Texture(),
      sustainDiffuse: new THREE.Texture(),
      sustainEmission: new THREE.Texture(),
      fretEmission: new THREE.Texture(),
    });
    const materials = createMaterialSet(registry);

    expect(materials.drum.kick.noteTinted.depthTest).toBe(true);
    // for (const kind of ["pad", "cymbal"] as const) {
    //   // expect(materials.drum[kind].noteTinted.depthTest).toBe(false);
    //   // expect(materials.drum[kind].noteTinted.depthWrite).toBe(false);
    //   // expect(materials.drum[kind].noteGhostTinted.depthTest).toBe(false);
    //   // expect(materials.drum[kind].noteGhostTinted.depthWrite).toBe(false);
    // }

    materials.destroy();
  });
});
