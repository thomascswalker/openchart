import * as THREE from "three";
import type { CircularHighwayTextures } from "../../../assets/highway/circular";

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

const texturedVertexSource = `
varying vec2 vUv;
varying float vWorldZ;
void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldZ = worldPosition.z;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`;

const texturedFragmentSource = `
precision mediump float;
uniform sampler2D uBaseTexture;
uniform sampler2D uEmissionTexture;
uniform vec3 uBaseColor;
uniform vec3 uEmissionColor;
uniform float uEmissionIntensity;
uniform float uAlpha;
uniform float uSelected;
uniform float uGhost;
uniform float uTintEnabled;
uniform float uPassed;
uniform float uUseStrikeLine;
uniform float uStrikeLineZ;
varying vec2 vUv;
varying float vWorldZ;
void main() {
  vec4 baseSample = texture2D(uBaseTexture, vUv);
  vec3 laneTint = mix(uBaseColor, vec3(1.0), uSelected * 0.35);
  vec3 ghostTint = mix(laneTint, vec3(0.82, 0.88, 1.0), uGhost);
  vec3 emission = texture2D(uEmissionTexture, vUv).rgb * uEmissionColor * uEmissionIntensity;
  float alpha = baseSample.a * uAlpha * (1.0 - uGhost * 0.55);
  if (alpha < 0.02) discard;
  vec3 composed = baseSample.rgb * mix(vec3(1.0), ghostTint, uTintEnabled) + emission;
  float passed = max(uPassed, step(uStrikeLineZ, vWorldZ) * uUseStrikeLine);
  float luminance = dot(composed, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(mix(composed, vec3(luminance), passed), alpha);
}`;

const solidFragmentSource = `
precision mediump float;
uniform vec3 uBaseColor;
uniform float uAlpha;
uniform float uSelected;
uniform float uGhost;
uniform float uPassed;
uniform float uUseStrikeLine;
uniform float uStrikeLineZ;
varying float vWorldZ;
void main() {
  vec3 laneTint = mix(uBaseColor, vec3(1.0), uSelected * 0.35);
  vec3 ghostTint = mix(laneTint, vec3(0.82, 0.88, 1.0), uGhost);
  float alpha = uAlpha * (1.0 - uGhost * 0.55);
  if (alpha < 0.02) discard;
  float passed = max(uPassed, step(uStrikeLineZ, vWorldZ) * uUseStrikeLine);
  float luminance = dot(ghostTint, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(mix(ghostTint, vec3(luminance), passed), alpha);
}`;

const stateByMesh = new WeakMap<THREE.Mesh, CircularMaterialState>();

export function rgbFromHex(hex: number): Rgb {
  const color = new THREE.Color(hex);
  return [color.r, color.g, color.b];
}

export function setCircularMaterialState(
  mesh: THREE.Mesh,
  state: Partial<CircularMaterialState>,
): void {
  const current = { ...defaultState, ...stateByMesh.get(mesh), ...state };
  stateByMesh.set(mesh, current);
  updateUniforms(mesh, current);
}

function updateUniforms(mesh: THREE.Mesh, state: CircularMaterialState): void {
  const material = mesh.material as THREE.ShaderMaterial;
  if (!material?.uniforms) return;
  const uniforms = material.uniforms;
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
    },
    transparent,
    depthTest: true,
    depthWrite: !transparent,
    side: THREE.DoubleSide,
  });
  return material;
}

export function createCircularMaterialSet(
  textures: CircularHighwayTextures,
): CircularMaterialSet {
  const fretColor = createMaterial(textures.fret, textures.fret, false);
  const fretNeutral = createMaterial(textures.fret, textures.fret, false);
  const noteColor = createMaterial(textures.note, textures.noteEmission, false);
  const noteNeutral = createMaterial(
    textures.note,
    textures.noteEmission,
    false,
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
