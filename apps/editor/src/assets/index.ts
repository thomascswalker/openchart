import * as THREE from "three";

export type Rgb = [number, number, number];
export type AssetPropertyValue = string | number | Rgb;
export type UniformValue = number | Rgb | THREE.Texture;
export type MaterialPropertyName =
  "diffuseTex" | "emissionTex" | "emissionMaskTex";

export interface MaterialProperties {
  diffuseTex?: string;
  emissionTex?: string;
  emissionMaskTex?: string;
  [name: string]: AssetPropertyValue | undefined;
}

export interface MaterialDefinition {
  vert: string;
  pixel: string;
  properties: MaterialProperties;
}

export interface MeshDefinition {
  root: string;
  mesh: string | null;
  material: string;
  materialIds: string[];
  tintedMaterialIds?: string[];
}

export interface AssetDefinition {
  meshes: Record<string, MeshDefinition>;
  materials: Record<string, MaterialDefinition>;
  unusedAssets?: Record<string, string>;
}

export type AssetDefinitions = AssetDefinition;

export interface ResolvedMaterialDefinition {
  key: string;
  definition: MaterialDefinition;
  vertexShader: string;
  fragmentShader: string;
  properties: Record<string, number | Rgb | ResolvedTextureResource>;
}

export interface ResolvedTextureResource {
  path: string;
  value?: THREE.Texture;
}

export interface ResolvedMeshDefinition {
  key: string;
  definition: MeshDefinition;
  url: string | null;
}

export interface ResolvedAssetDefinition {
  meshes: Record<string, ResolvedMeshDefinition>;
  materials: Record<string, ResolvedMaterialDefinition>;
}
