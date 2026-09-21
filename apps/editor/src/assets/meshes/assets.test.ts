import { describe, expect, it } from "vitest";
import { assets, materialAssignments, primitiveRoles } from ".";

describe("circular highway asset manifest", () => {
  it("contains every checked-in runtime and source asset", () => {
    expect(assets.fretTopMesh).toContain("FretTop.glb");
    expect(assets.fretBaseMesh).toContain("FretBase.glb");
    expect(assets.noteMesh).toContain("Note.glb");
    expect(assets.fretColor).toContain("Fret.png");
    expect(assets.noteColor).toContain("Note.png");
    expect(assets.noteEmission).toContain("NoteEmission.png");
    expect(assets.sustainColor).toContain("Sustain.png");
    expect(assets.sustainEmission).toContain("SustainEmission.png");
  });

  it("defines the authored material order for every runtime geometry", () => {
    expect(materialAssignments.note).toEqual([
      "Circular_Note_Top",
      "Circular_Note_Color",
      "Circular_Note_Indicator",
      "Circular_Note_Bottom",
    ]);
    expect(materialAssignments.fretTop).toHaveLength(4);
    expect(materialAssignments.fretBase).toHaveLength(2);
    expect(primitiveRoles.note).toEqual([
      "neutral",
      "tinted",
      "neutral",
      "neutral",
    ]);
  });
});
