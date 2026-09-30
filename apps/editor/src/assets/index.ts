import * as THREE from "three";

type Rgb = [number, number, number];

/* Mapping of TS to GLSL material uniforms */
interface Uniforms {
  [key: string]: number | Rgb | THREE.Texture;
  diffuse: Rgb | THREE.Texture;
  diffuseTex: THREE.Texture;
  emission: Rgb | THREE.Texture;
  emissionTex: THREE.Texture;
}

interface Material {
  vert?: string;
  frag?: string;
  uniforms: Uniforms;
}

interface MaterialSet {
  [key: string]: Material;
}
