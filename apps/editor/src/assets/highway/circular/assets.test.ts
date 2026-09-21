import { describe, expect, it } from "vitest";
import {
  circularHighwayAssets,
  circularHighwayMaterialAssignments,
  circularHighwayPrimitiveRoles,
} from ".";

describe("circular highway asset manifest", () => {
  it("contains every checked-in runtime and source asset", () => {
    expect(circularHighwayAssets.fretTopModel).toContain("FretTop.glb");
    expect(circularHighwayAssets.fretBaseModel).toContain("FretBase.glb");
    expect(circularHighwayAssets.noteModel).toContain("Note.glb");
    expect(circularHighwayAssets.fretTexture).toContain("Fret.png");
    expect(circularHighwayAssets.noteTexture).toContain("Note.png");
    expect(circularHighwayAssets.noteEmissionTexture).toContain(
      "NoteEmission.png",
    );
    expect(circularHighwayAssets.sustainTexture).toContain("Sustain.png");
    expect(circularHighwayAssets.sustainEmissionTexture).toContain(
      "SustainEmission.png",
    );
  });

  it("defines the authored material order for every runtime geometry", () => {
    expect(circularHighwayMaterialAssignments.note).toEqual([
      "Circular_Note_Top",
      "Circular_Note_Color",
      "Circular_Note_Indicator",
      "Circular_Note_Bottom",
    ]);
    expect(circularHighwayMaterialAssignments.fretTop).toHaveLength(4);
    expect(circularHighwayMaterialAssignments.fretBase).toHaveLength(2);
    expect(circularHighwayPrimitiveRoles.note).toEqual([
      "neutral",
      "tinted",
      "neutral",
      "neutral",
    ]);
  });
});
