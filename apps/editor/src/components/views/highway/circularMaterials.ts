import { BLEND_MODES, Texture } from "pixi.js";
import { Camera, Color, Material, type Mesh3D } from "pixi3d/pixi7";
import type { CircularHighwayTextures } from "../../../assets/highway/circular";

export type Rgb = [number, number, number];

export interface CircularMaterialState {
  baseColor: Rgb;
  emissionColor: Rgb;
  emissionIntensity: number;
  alpha: number;
  selected: boolean;
  ghost: boolean;
}

export interface CircularMaterialSet {
  fret: Material;
  note: Material;
  sustain: Material;
  destroy(): void;
}

export const CIRCULAR_MATERIAL_MAPPING = {
  baseColor: "note/fret: texture.rgb * uBaseColor; sustain: solid uBaseColor",
  laneTint: "uBaseColor",
  emission: "emissionTexture.rgb * uEmissionColor * uEmissionIntensity",
  alpha: "baseTexture.a * uAlpha with a 0.02 discard cutoff",
  depth: "depth test enabled; opaque notes write depth; ghost/sustain do not",
  culling: "double-sided imported circular/fret surfaces",
  selected: "uSelected brightens the lane tint and emission",
  ghost: "uGhost mixes a neutral tint and reduces alpha",
  sustain:
    "solid uBaseColor; the generated quad UVs don't map cleanly to Sustain.png",
} as const;

const defaultState: CircularMaterialState = {
  baseColor: [1, 1, 1],
  emissionColor: [1, 1, 1],
  emissionIntensity: 1,
  alpha: 1,
  selected: false,
  ghost: false,
};

export const CIRCULAR_SHADER_ATTRIBUTES = {
  position: "a_Position",
  normal: "a_Normal",
  uv: "a_UV1",
} as const;

const meshStates = new WeakMap<object, CircularMaterialState>();

/**
 * Port map for the YARG Circular gameplay note material:
 *
 * - Base-color mask: `Fret.png`/`Note.png` is sampled and multiplied by the
 *   lane colour.
 * - Emission mask: the `*Emission.png` texture is sampled independently and
 *   multiplied by emission colour and intensity.
 * - Alpha: source alpha is multiplied by `uAlpha`; ghost notes additionally
 *   use the YARG-style reduced opacity. Fragments below the cutoff are
 *   discarded so the transparent edge does not write a hard rectangle.
 * - State: `uSelected` brightens the selected lane tint and `uGhost` mixes in
 *   a neutral tint while lowering opacity.
 * - Depth/order: normal notes depth-test and write depth; the shared material
 *   keeps depth testing enabled while transparent sustain/ghost states disable
 *   depth writes and render after the opaque board.
 * - Culling: circular note and fret surfaces are double-sided because their
 *   imported FBX winding is viewed from both the approach and strike angles.
 * - Sustains: solid `uBaseColor`, not textured — the generated quad/ribbon
 *   UVs don't map cleanly onto `Sustain.png`.
 *
 * The source reference is YARG's Circular note material directory:
 * https://github.com/YARC-Official/YARG/tree/master/Assets/Art/Materials/Gameplay/Notes
 */

const vertexSource = `
attribute vec3 ${CIRCULAR_SHADER_ATTRIBUTES.position};
attribute vec3 ${CIRCULAR_SHADER_ATTRIBUTES.normal};
attribute vec2 ${CIRCULAR_SHADER_ATTRIBUTES.uv};
uniform mat4 uModel;
uniform mat4 uViewProjection;
varying vec2 vUv;
varying vec3 vNormal;
void main(void) {
  vUv = ${CIRCULAR_SHADER_ATTRIBUTES.uv};
  vNormal = mat3(uModel) * ${CIRCULAR_SHADER_ATTRIBUTES.normal};
  gl_Position = uViewProjection * uModel * vec4(${CIRCULAR_SHADER_ATTRIBUTES.position}, 1.0);
}
`;

const fragmentSource = `
precision mediump float;
uniform sampler2D uBaseTexture;
uniform sampler2D uEmissionTexture;
uniform vec3 uBaseColor;
uniform vec3 uEmissionColor;
uniform float uEmissionIntensity;
uniform float uAlpha;
uniform float uSelected;
uniform float uGhost;
varying vec2 vUv;
varying vec3 vNormal;
void main(void) {
  vec4 baseSample = texture2D(uBaseTexture, vUv);
  vec3 laneTint = mix(uBaseColor, vec3(1.0), uSelected * 0.35);
  vec3 ghostTint = mix(laneTint, vec3(0.82, 0.88, 1.0), uGhost);
  vec3 emission = texture2D(uEmissionTexture, vUv).rgb
    * uEmissionColor * uEmissionIntensity;
  float alpha = baseSample.a * uAlpha * (1.0 - uGhost * 0.55);
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(baseSample.rgb * ghostTint + emission, alpha);
}
`;

const solidFragmentSource = `
precision mediump float;
uniform vec3 uBaseColor;
uniform float uAlpha;
uniform float uSelected;
uniform float uGhost;
void main(void) {
  vec3 laneTint = mix(uBaseColor, vec3(1.0), uSelected * 0.35);
  vec3 ghostTint = mix(laneTint, vec3(0.82, 0.88, 1.0), uGhost);
  float alpha = uAlpha * (1.0 - uGhost * 0.55);
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(ghostTint, alpha);
}
`;

export function rgbFromHex(hex: number): Rgb {
  const color = Color.fromHex(hex);
  return [color.r, color.g, color.b];
}

export function setCircularMaterialState(
  mesh: Mesh3D,
  state: Partial<CircularMaterialState>,
): void {
  meshStates.set(mesh, { ...defaultState, ...state });
}

function createMaterial(
  baseTexture: Texture,
  emissionTexture: Texture,
  transparent: boolean,
  fragment = fragmentSource,
): Material {
  const material = Material.from(vertexSource, fragment, (mesh, shader) => {
    const state = meshStates.get(mesh) ?? defaultState;
    shader.uniforms.uModel = mesh.worldTransform.array;
    shader.uniforms.uViewProjection = Camera.main.viewProjection.array;
    shader.uniforms.uBaseColor = state.baseColor;
    shader.uniforms.uAlpha = 1;
    shader.uniforms.uSelected = state.selected ? 1 : 0;
    shader.uniforms.uGhost = state.ghost ? 1 : 0;
    if (fragment === fragmentSource) {
      shader.uniforms.uBaseTexture = baseTexture;
      shader.uniforms.uEmissionTexture = emissionTexture;
      shader.uniforms.uEmissionColor = state.emissionColor;
      shader.uniforms.uEmissionIntensity = state.emissionIntensity;
    }
  });
  material.doubleSided = true;
  material.depthMask = !transparent;
  material.blendMode = BLEND_MODES.NORMAL;
  if (transparent) {
    (material as unknown as { renderSortType: string }).renderSortType =
      "transparent";
  }
  return material;
}

export function createCircularMaterialSet(
  textures: CircularHighwayTextures,
): CircularMaterialSet {
  const fret = createMaterial(textures.fret, textures.fret, false);
  const note = createMaterial(textures.note, textures.noteEmission, true);
  // Sustains stay solid-colored: the generated quad UVs don't map cleanly
  // onto Sustain.png.
  const sustain = createMaterial(
    textures.sustain,
    textures.sustainEmission,
    true,
    solidFragmentSource,
  );
  return {
    fret,
    note,
    sustain,
    destroy() {
      fret.destroy();
      note.destroy();
      sustain.destroy();
    },
  };
}
