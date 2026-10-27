import * as THREE from "three";
import type {
  MaterialKey,
  ResourceRegistry,
} from "../../../../rendering/registry";
import type {
  MaterialPropertyName,
  ResolvedMaterialDefinition,
  ResolvedTextureResource,
} from "../../../../assets/index";
import type { DrumPlacementKind } from "../profile";
import { HIGHWAY_GEOMETRY_CATALOG } from "./geometryCatalog";

export type Rgb = [number, number, number];

export interface MaterialState {
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
  drum: Record<DrumPlacementKind, NoteMaterialVariants>;
  sustain: THREE.ShaderMaterial;
  destroy(): void;
}

export interface NoteMaterialVariants {
  noteTinted: THREE.ShaderMaterial;
  noteGrayscale: THREE.ShaderMaterial;
  noteGhostTinted: THREE.ShaderMaterial;
  noteGhostGrayscale: THREE.ShaderMaterial;
}

const defaultState: MaterialState = {
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

const stateByMaterial = new WeakMap<THREE.Material, MaterialState>();

// Default mask for materials that don't provide one: fully white so the emission tint applies everywhere, matching pre-mask behavior.
const whiteMaskTexture = new THREE.DataTexture(
  new Uint8Array([255, 255, 255, 255]),
  1,
  1,
);
whiteMaskTexture.needsUpdate = true;

export function rgbFromHex(hex: number): Rgb {
  return [
    ((hex >> 16) & 0xff) / 0xff,
    ((hex >> 8) & 0xff) / 0xff,
    (hex & 0xff) / 0xff,
  ];
}

export function setMaterialState(
  mesh: THREE.Mesh,
  state: Partial<MaterialState>,
): void {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : mesh.material
      ? [mesh.material]
      : [];
  materials.forEach((material) => setMaterialStateForMaterial(material, state));
}

export function setMaterialStateForMaterial(
  material: THREE.Material,
  state: Partial<MaterialState>,
): void {
  const current = {
    ...defaultState,
    ...stateByMaterial.get(material),
    ...state,
  };
  stateByMaterial.set(material, current);
  updateUniforms(material, current);
}

function updateUniforms(material: THREE.Material, state: MaterialState): void {
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
  transparent?: boolean;
  depthTest?: boolean;
}

const whiteTexture = new THREE.DataTexture(
  new Uint8Array([255, 255, 255, 255]),
  1,
  1,
);
whiteTexture.needsUpdate = true;

function textureProperty(
  definition: ResolvedMaterialDefinition,
  name: MaterialPropertyName,
): THREE.Texture | undefined {
  const property = definition.properties[name] as
    ResolvedTextureResource | number | Rgb | undefined;
  return property && typeof property === "object" && "value" in property
    ? property.value
    : undefined;
}

class MaterialManager {
  materials: Record<string, THREE.ShaderMaterial> = {};

  public create(
    name: string,
    definition: ResolvedMaterialDefinition,
    { transparent = false, depthTest = true }: CreateMaterialOptions = {},
  ): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      vertexShader: definition.vertexShader,
      fragmentShader: definition.fragmentShader,
      uniforms: {
        uBaseTexture: {
          value: textureProperty(definition, "diffuseTex") ?? whiteTexture,
        },
        uBaseColor: { value: [1, 1, 1] },
        uBaseIntensity: { value: [1, 1, 1] },
        uEmissionTexture: {
          value: textureProperty(definition, "emissionTex") ?? whiteTexture,
        },
        uEmissionMaskTexture: {
          value:
            textureProperty(definition, "emissionMaskTex") ?? whiteMaskTexture,
        },
        uEmissionColor: { value: [1, 1, 1] },
        uEmissionIntensity: { value: 1 },
        uAlpha: { value: 1 },
        uSelected: { value: 0 },
        uGhost: { value: 0 },
        uTintEnabled: { value: 1 },
        uPassed: { value: 0 },
        uUseStrikeLine: { value: 0 },
        uStrikeLineZ: { value: -3.5 },
        uCameraTick: { value: 0 },
        uPpqn: { value: 480 },
        uNearBoardZ: { value: 0.5 },
        uScrollSpeed: { value: 1 },
      },
      transparent,
      depthTest,
      depthWrite: !transparent && depthTest,
      side: THREE.DoubleSide,
    });
    this.materials[name] = material;
    return material;
  }
}

export function createMaterialSet(registry: ResourceRegistry): MaterialSet {
  const manager = new MaterialManager();
  const createVariants = (
    key: MaterialKey,
    prefix: string,
    depthTest = true,
  ): NoteMaterialVariants => {
    const definition = registry.getMaterial(key);
    return {
      noteTinted: manager.create(`${prefix}Tinted`, definition, { depthTest }),
      noteGrayscale: manager.create(`${prefix}Neutral`, definition, {
        depthTest,
      }),
      noteGhostTinted: manager.create(`${prefix}GhostTinted`, definition, {
        transparent: true,
        depthTest,
      }),
      noteGhostGrayscale: manager.create(`${prefix}GhostNeutral`, definition, {
        transparent: true,
        depthTest,
      }),
    };
  };
  const fret = createVariants(
    HIGHWAY_GEOMETRY_CATALOG.fret.materialKey!,
    "fret",
  );
  const note = createVariants(
    HIGHWAY_GEOMETRY_CATALOG.note.materialKey!,
    "roundNote",
  );
  const sustain = manager.create("sustain", registry.getMaterial("sustain"), {
    transparent: true,
  });
  const createDrumMaterials = (
    kind: DrumPlacementKind,
  ): NoteMaterialVariants => {
    const geometry = HIGHWAY_GEOMETRY_CATALOG[kind];
    return createVariants(
      geometry.materialKey as MaterialKey,
      kind,
      geometry.renderPass !== "topNote",
    );
  };
  return {
    fretTinted: fret.noteTinted,
    fretGrayscale: fret.noteGrayscale,
    noteTinted: note.noteTinted,
    noteGrayscale: note.noteGrayscale,
    noteGhostTinted: note.noteGhostTinted,
    noteGhostGrayscale: note.noteGhostGrayscale,
    drum: {
      kick: createDrumMaterials("kick"),
      cymbal: createDrumMaterials("cymbal"),
      pad: createDrumMaterials("pad"),
    },
    sustain,
    destroy() {
      Object.values(manager.materials).forEach((material) =>
        material.dispose(),
      );
    },
  };
}
