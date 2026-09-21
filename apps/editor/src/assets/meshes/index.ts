import type * as THREE from "three";

export const assets = {
  /* Fret */
  fretTopMesh: new URL("./highway/FretTop.glb", import.meta.url).href,
  fretBaseMesh: new URL("./highway/FretBase.glb", import.meta.url).href,
  fretColor: new URL("./highway/Fret.png", import.meta.url).href,

  /* Note */
  noteMesh: new URL("./highway/Note.glb", import.meta.url).href,
  noteColor: new URL("./highway/Note.png", import.meta.url).href,
  noteEmission: new URL("./highway/NoteEmission.png", import.meta.url).href,

  /* Sustain */
  sustainColor: new URL("./highway/Sustain.png", import.meta.url).href,
  sustainEmission: new URL("./highway/SustainEmission.png", import.meta.url)
    .href,
} as const;

export type AssetUrls = typeof assets;

export const materialAssignments = {
  note: [
    "Circular_Note_Top",
    "Circular_Note_Color",
    "Circular_Note_Indicator",
    "Circular_Note_Bottom",
  ],
  fretTop: [
    "Note_Tap.034",
    "Note_Color_Yellow",
    "Note_Bottom.048",
    "Note_SIde.020",
  ],
  fretBase: ["Note_Color_Yellow", "Note_Tap.034"],
} as const;

export interface Textures {
  fret: THREE.Texture;
  note: THREE.Texture;
  noteEmission: THREE.Texture;
  sustain: THREE.Texture;
  sustainEmission: THREE.Texture;
}

export const primitiveRoles = {
  note: ["neutral", "tinted", "neutral", "neutral"],
  fretTop: ["neutral", "tinted", "neutral", "neutral"],
  fretBase: ["tinted", "neutral"],
} as const;
