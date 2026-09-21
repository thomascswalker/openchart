import { describe, expect, it } from "vitest";
import {
  CIRCULAR_MATERIAL_MAPPING,
  CIRCULAR_SHADER_ATTRIBUTES,
  rgbFromHex,
} from "./circularMaterials";

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
      center: expect.stringContaining("uPreserveWhiteCenter"),
    });
  });

  it("preserves the five lane colours", () => {
    expect(
      [0x00a651, 0xdc2626, 0xfacc15, 0x2563eb, 0xf97316].map(rgbFromHex),
    ).toEqual([
      [0, 0.6509803921568628, 0.3176470588235294],
      [0.8627450980392157, 0.14901960784313725, 0.14901960784313725],
      [0.9803921568627451, 0.7372549019607844, 0.08235294117647059],
      [0.1450980392156863, 0.3843137254901961, 0.9215686274509803],
      [0.9764705882352941, 0.45098039215686275, 0.0196078431372549],
    ]);
  });

  it("uses Three.js shader attributes supplied by imported geometry", () => {
    expect(CIRCULAR_SHADER_ATTRIBUTES).toEqual({
      position: "position",
      normal: "normal",
      uv: "uv",
    });
  });
});
