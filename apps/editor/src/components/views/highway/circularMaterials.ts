import * as THREE from "three";
import type { Textures } from "../../../assets";
import solidFragmentSource from "./shaders/solid.frag.glsl?raw";
import texturedFragmentSource from "./shaders/textured.frag.glsl?raw";
import texturedVertexSource from "./shaders/textured.vert.glsl?raw";

export type Rgb = [number, number, number];

export interface CircularMaterialState {
  baseColor: Rgb;
  emissionColor: Rgb;
  emissionIntensity: number;
  alpha: number;
  selected: boolean;
  ghost: boolean;
  tint: boolean;
  passed: boolean;
  useStrikeLine: boolean;
  strikeLineZ: number;
}

export interface CircularMaterialSet {
  fretColor: THREE.ShaderMaterial;
  fretNeutral: THREE.ShaderMaterial;
  noteColor: THREE.ShaderMaterial;
  noteNeutral: THREE.ShaderMaterial;
  noteGhostColor: THREE.ShaderMaterial;
  noteGhostNeutral: THREE.ShaderMaterial;
  sustain: THREE.ShaderMaterial;
  destroy(): void;
}

/** Imported GLTF attributes use Three.js' standard geometry attribute names. */
export const CIRCULAR_SHADER_ATTRIBUTES = {
  position: "position",
  normal: "normal",
  uv: "uv",
} as const;

export const CIRCULAR_MATERIAL_MAPPING = {
  baseColor: "note/fret texture.rgb * uBaseColor; sustain: solid uBaseColor",
  laneTint: "uBaseColor",
  emission: "emissionTexture.rgb * uEmissionColor * uEmissionIntensity",
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
  center: "uPreserveWhiteCenter keeps the original note texture center",
} as const;

const defaultState: CircularMaterialState = {
  baseColor: [1, 1, 1],
  emissionColor: [1, 1, 1],
  emissionIntensity: 1,
  alpha: 1,
  selected: false,
  ghost: false,
  tint: true,
  passed: false,
  useStrikeLine: false,
  strikeLineZ: -3.5,
};

const stateByMaterial = new WeakMap<THREE.Material, CircularMaterialState>();

export function rgbFromHex(hex: number): Rgb {
  return [
    ((hex >> 16) & 0xff) / 0xff,
    ((hex >> 8) & 0xff) / 0xff,
    (hex & 0xff) / 0xff,
  ];
}

export function setCircularMaterialState(
  mesh: THREE.Mesh,
  state: Partial<CircularMaterialState>,
): void {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : mesh.material
      ? [mesh.material]
      : [];
  materials.forEach((material) =>
    setCircularMaterialStateForMaterial(material, state),
  );
}

export function setCircularMaterialStateForMaterial(
  material: THREE.Material,
  state: Partial<CircularMaterialState>,
): void {
  const current = {
    ...defaultState,
    ...stateByMaterial.get(material),
    ...state,
  };
  stateByMaterial.set(material, current);
  updateUniforms(material, current);
}

function updateUniforms(
  material: THREE.Material,
  state: CircularMaterialState,
): void {
  const shaderMaterial = material as THREE.ShaderMaterial;
  if (!shaderMaterial?.uniforms) return;
  const uniforms = shaderMaterial.uniforms;
  if (uniforms.uBaseColor) uniforms.uBaseColor.value = state.baseColor;
  if (uniforms.uEmissionColor) {
    uniforms.uEmissionColor.value = state.emissionColor;
  }
  if (uniforms.uEmissionIntensity) {
    uniforms.uEmissionIntensity.value = state.emissionIntensity;
  }
  if (uniforms.uAlpha) uniforms.uAlpha.value = state.alpha;
  if (uniforms.uSelected) uniforms.uSelected.value = state.selected ? 1 : 0;
  if (uniforms.uGhost) uniforms.uGhost.value = state.ghost ? 1 : 0;
  if (uniforms.uTintEnabled) uniforms.uTintEnabled.value = state.tint ? 1 : 0;
  if (uniforms.uPassed) uniforms.uPassed.value = state.passed ? 1 : 0;
  if (uniforms.uUseStrikeLine) {
    uniforms.uUseStrikeLine.value = state.useStrikeLine ? 1 : 0;
  }
  if (uniforms.uStrikeLineZ) uniforms.uStrikeLineZ.value = state.strikeLineZ;
}

function createMaterial(
  baseTexture: THREE.Texture,
  emissionTexture: THREE.Texture,
  transparent: boolean,
  fragmentShader = texturedFragmentSource,
  preserveWhiteCenter = false,
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    vertexShader: texturedVertexSource,
    fragmentShader,
    uniforms: {
      uBaseTexture: { value: baseTexture },
      uEmissionTexture: { value: emissionTexture },
      uBaseColor: { value: [1, 1, 1] },
      uEmissionColor: { value: [1, 1, 1] },
      uEmissionIntensity: { value: 1 },
      uAlpha: { value: 1 },
      uSelected: { value: 0 },
      uGhost: { value: 0 },
      uTintEnabled: { value: 1 },
      uPassed: { value: 0 },
      uUseStrikeLine: { value: 0 },
      uStrikeLineZ: { value: -3.5 },
      uPreserveWhiteCenter: { value: preserveWhiteCenter ? 1 : 0 },
    },
    transparent,
    depthTest: true,
    depthWrite: !transparent,
    side: THREE.DoubleSide,
  });
  return material;
}

export function createCircularMaterialSet(
  textures: Textures,
): CircularMaterialSet {
  const fretColor = createMaterial(textures.fret, textures.fret, false);
  const fretNeutral = createMaterial(textures.fret, textures.fret, false);
  const noteColor = createMaterial(
    textures.note,
    textures.noteEmission,
    false,
    texturedFragmentSource,
    true,
  );
  const noteNeutral = createMaterial(
    textures.note,
    textures.noteEmission,
    false,
    texturedFragmentSource,
    true,
  );
  const noteGhostColor = createMaterial(
    textures.note,
    textures.noteEmission,
    true,
  );
  const noteGhostNeutral = createMaterial(
    textures.note,
    textures.noteEmission,
    true,
  );
  const sustain = createMaterial(
    textures.sustain,
    textures.sustainEmission,
    true,
    solidFragmentSource,
  );
  return {
    fretColor,
    fretNeutral,
    noteColor,
    noteNeutral,
    noteGhostColor,
    noteGhostNeutral,
    sustain,
    destroy() {
      [
        fretColor,
        fretNeutral,
        noteColor,
        noteNeutral,
        noteGhostColor,
        noteGhostNeutral,
        sustain,
      ].forEach((material) => material.dispose());
    },
  };
}
