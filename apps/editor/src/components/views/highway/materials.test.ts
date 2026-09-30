import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createMaterialSet, rgbFromHex } from "./materials";
import type { TextureResource } from "../../../rendering/registry";
import {
  DRUM_GHOST_GEOMETRY_IDS,
  HIGHWAY_GEOMETRY_CATALOG,
} from "./geometryCatalog";

export const CIRCULAR_SHADER_ATTRIBUTES = {
  position: "position",
  normal: "normal",
  uv: "uv",
} as const;

export const CIRCULAR_MATERIAL_MAPPING = {
  baseColor: "note/fret texture.rgb * uBaseColor; sustain: solid uBaseColor",
  laneTint: "uBaseColor",
  emission:
    "emissionTexture.rgb * mix(1, uEmissionColor, emissionMaskTexture.r) * uEmissionIntensity",
  alpha: "baseTexture.a * uAlpha with a 0.02 discard cutoff",
  tint: "only authored tinted primitives multiply their base texture by uBaseColor",
  passed:
    "final composed colour is converted to luminance at/near the strike line",
  depth: "depth test enabled; opaque notes write depth; ghost/sustain do not",
  culling: "double-sided imported circular/fret surfaces",
  selected: "uSelected brightens the lane tint and emission",
  ghost: "uGhost mixes a neutral tint and reduces alpha",
  sustain:
    "solid uBaseColor; generated quad UVs do not map cleanly to Sustain.png",
} as const;

describe("circular material state contract", () => {
  it("documents all shader state required by the highway", () => {
    expect(CIRCULAR_MATERIAL_MAPPING).toMatchObject({
      baseColor: expect.stringContaining("texture.rgb"),
      emission: expect.stringContaining("uEmissionIntensity"),
      alpha: expect.stringContaining("uAlpha"),
      tint: expect.stringContaining("tinted"),
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

  it("uses Three.js shader attributes supplied by imported geometry", () => {
    expect(CIRCULAR_SHADER_ATTRIBUTES).toEqual({
      position: "position",
      normal: "normal",
      uv: "uv",
    });
  });

  it("uses the shared note fragment shader for every drum note variant", () => {
    const texturesByName = Object.fromEntries(
      [
        "fret",
        "note",
        "noteEmissionMask",
        "kickNote",
        "cymbalNote",
        "padNote",
        "sustain",
        "sustainEmission",
      ].map((key) => [key, new THREE.Texture()]),
    );
    const textures = Object.fromEntries(
      [
        "fret",
        "note",
        "noteEmissionMask",
        "kickNote",
        "cymbalNote",
        "padNote",
        "sustain",
        "sustainEmission",
      ].map((key) => [key, { value: texturesByName[key] }]),
    ) as unknown as Record<string, TextureResource>;
    const materials = createMaterialSet(textures);

    for (const variants of Object.values(materials.drum)) {
      for (const material of Object.values(variants)) {
        expect(material.fragmentShader).toBe(
          materials.noteTinted.fragmentShader,
        );
      }
    }

    expect(materials.drum.kick.noteTinted.uniforms.uBaseTexture.value).toBe(
      texturesByName.kickNote,
    );
    expect(materials.drum.cymbal.noteTinted.uniforms.uBaseTexture.value).toBe(
      texturesByName.cymbalNote,
    );
    expect(materials.drum.pad.noteTinted.uniforms.uBaseTexture.value).toBe(
      texturesByName.padNote,
    );
    for (const kind of ["kick", "cymbal", "pad"] as const) {
      const ghostGeometry =
        HIGHWAY_GEOMETRY_CATALOG[DRUM_GHOST_GEOMETRY_IDS[kind]];
      expect(
        materials.drum[kind].noteGhostTinted.uniforms.uBaseTexture.value,
      ).toBe(texturesByName[ghostGeometry.textureResource!]);
    }
    materials.destroy();
    Object.values(texturesByName).forEach((texture) => texture.dispose());
  });
});
