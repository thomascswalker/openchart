import * as THREE from "three";
import solidFragmentSource from "./shaders/solid.frag.glsl?raw";
import texturedFragmentSource from "./shaders/textured.frag.glsl?raw";
import texturedVertexSource from "./shaders/textured.vert.glsl?raw";
import type { TextureResource } from "../../../rendering/registry";

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

export interface MaterialSet {
  fretTinted: THREE.ShaderMaterial;
  fretGrayscale: THREE.ShaderMaterial;
  noteTinted: THREE.ShaderMaterial;
  noteGrayscale: THREE.ShaderMaterial;
  noteGhostTinted: THREE.ShaderMaterial;
  noteGhostGrayscale: THREE.ShaderMaterial;
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

interface CreateMaterialOptions {
  color: THREE.Texture;
  emission?: THREE.Texture;
  transparent?: boolean;
  vert?: string;
  frag?: string;
  preserveWhiteCenter?: boolean;
}

class MaterialManager {
  materials: Record<string, THREE.ShaderMaterial> = {};

  public create(
    name: string,
    {
      color,
      emission,
      transparent = false,
      vert = texturedVertexSource,
      frag = texturedFragmentSource,
      preserveWhiteCenter = false,
    }: CreateMaterialOptions,
  ): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uBaseTexture: { value: color },
        uEmissionTexture: { value: emission },
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
    this.materials[name] = material;
    return material;
  }
}

export function createMaterialSet(
  textures: Record<string, TextureResource>,
): MaterialSet {
  const manager = new MaterialManager();
  const fretColor = manager.create("fretColor", {
    color: textures.fret.value!,
    emission: textures.fret.value!,
  });
  const fretNeutral = manager.create("fretNeutral", {
    color: textures.fret.value!,
    emission: textures.fret.value!,
  });
  const noteColor = manager.create("noteColor", {
    color: textures.note.value!,
    emission: textures.noteEmission.value!,
    preserveWhiteCenter: true,
  });
  const noteNeutral = manager.create("noteNeutral", {
    color: textures.note.value!,
    emission: textures.noteEmission.value!,
    preserveWhiteCenter: true,
  });
  const noteGhostColor = manager.create("noteGhostColor", {
    color: textures.note.value!,
    emission: textures.noteEmission.value!,
    transparent: true,
  });
  const noteGhostNeutral = manager.create("noteGhostNeutral", {
    color: textures.note.value!,
    emission: textures.noteEmission.value!,
    transparent: true,
  });
  const sustain = manager.create("sustain", {
    color: textures.sustain.value!,
    emission: textures.sustainEmission.value!,
    transparent: true,
    frag: solidFragmentSource,
  });
  return {
    fretTinted: fretColor,
    fretGrayscale: fretNeutral,
    noteTinted: noteColor,
    noteGrayscale: noteNeutral,
    noteGhostTinted: noteGhostColor,
    noteGhostGrayscale: noteGhostNeutral,
    sustain,
    destroy() {
      Object.values(manager.materials).forEach((material) =>
        material.dispose(),
      );
    },
  };
}
