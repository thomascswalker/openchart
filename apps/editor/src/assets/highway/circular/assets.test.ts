import { describe, expect, it } from "vitest";
import { circularHighwayAssets } from ".";

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
});
