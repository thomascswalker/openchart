import { ChannelMessage, MetaType, Midi } from "@midiedit/core";
import { describe, expect, it } from "vitest";
import {
  createProjectMetadata,
  ProjectValidationError,
  validateProjectMetadata,
} from "./projectMetadata";
import {
  createProjectDocument,
  deserializeProject,
  exportMidi,
  PROJECT_ARCHIVE_METADATA_ENTRY,
  PROJECT_ARCHIVE_MIDI_ENTRY,
  serializeProject,
} from "./projectService";
import { createZip, readZip } from "./zipArchive";

function createMidi(): Midi {
  const midi = new Midi();
  midi.addTrack(); // Empty tracks are valid and serialize with EndOfTrack.
  midi.addTempoChange(0, 500_000);
  midi.tracks[0].events.push({
    deltaTime: 0,
    status: 0xff,
    type: MetaType.TextEvent,
    length: 0,
    data: { text: "project text event" },
  });
  midi.tracks[0].addNote(60, 0, 100, 240);
  return midi;
}

describe("project metadata", () => {
  it("creates a complete valid metadata object with a stable ID", () => {
    const metadata = createProjectMetadata("Example");
    expect(validateProjectMetadata(metadata)).toEqual(metadata);
    expect(metadata.ID).not.toBe("");
  });

  it("reports JSON paths for important invalid values", () => {
    const metadata = createProjectMetadata();
    metadata.Chart.PreviewEnd = -1;
    metadata.Difficulty.Drums = 8;
    expect(() => validateProjectMetadata(metadata)).toThrow(
      ProjectValidationError,
    );
    try {
      validateProjectMetadata(metadata);
    } catch (error) {
      expect((error as ProjectValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "$.Chart.PreviewEnd" }),
          expect.objectContaining({ path: "$.Difficulty.Drums" }),
        ]),
      );
    }
  });
});

describe(".midproject serialization", () => {
  it("round-trips an empty MIDI track, notes, tempo, and text metadata", async () => {
    const midi = createMidi();
    const document = createProjectDocument(
      midi,
      createProjectMetadata("Round trip"),
    );
    const bytes = await serializeProject(document);
    expect([...readZip(bytes).keys()].sort()).toEqual([
      PROJECT_ARCHIVE_METADATA_ENTRY,
      PROJECT_ARCHIVE_MIDI_ENTRY,
    ]);
    const restored = await deserializeProject(bytes, {
      fileName: "round.midproject",
      fileHandle: null,
    });

    expect(restored.source.fileName).toBe("round.midproject");
    expect(restored.midi.trackCount).toBe(1);
    expect(restored.midi.tracks[0].getNotes()).toHaveLength(1);
    expect(restored.midi.getTempoChanges()[0].microsecondsPerQuarterNote).toBe(
      500_000,
    );
    expect(
      restored.midi.tracks[0]
        .getMetaEvents()
        .some((event) => event.type === MetaType.TextEvent),
    ).toBe(true);
  });

  it("round-trips a MIDI file containing an otherwise empty track", async () => {
    const midi = new Midi();
    midi.addTrack();
    const restored = await deserializeProject(
      await serializeProject(
        createProjectDocument(midi, createProjectMetadata()),
      ),
    );
    expect(restored.midi.trackCount).toBe(1);
    expect(restored.midi.tracks[0].events).toHaveLength(1);
  });

  it("exports parseable standard MIDI bytes", async () => {
    const document = createProjectDocument(
      createMidi(),
      createProjectMetadata("Export"),
    );
    const exported = exportMidi(document);
    const reparsed = new Midi(exported.bytes);
    expect(exported.suggestedName).toBe("Export.mid");
    expect(reparsed.tracks[0].getNotes()).toHaveLength(1);
    expect(
      reparsed.tracks[0]
        .getChannelEvents()
        .some((event) => event.messageType === ChannelMessage.NoteOn),
    ).toBe(true);
  });

  it("rejects corrupt archives, missing canonical entries, and newer versions", async () => {
    await expect(deserializeProject(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      "ZIP",
    );

    const midi = createMidi().toBuffer();
    const missingMidi = createZip([
      {
        name: PROJECT_ARCHIVE_METADATA_ENTRY,
        bytes: new TextEncoder().encode(
          JSON.stringify(createProjectMetadata()),
        ),
      },
    ]);
    await expect(deserializeProject(missingMidi)).rejects.toThrow(
      PROJECT_ARCHIVE_MIDI_ENTRY,
    );

    expect(() =>
      createZip([
        { name: PROJECT_ARCHIVE_METADATA_ENTRY, bytes: new Uint8Array() },
        { name: PROJECT_ARCHIVE_METADATA_ENTRY, bytes: new Uint8Array() },
      ]),
    ).toThrow("Duplicate ZIP entry");

    const futureMetadata = { ...createProjectMetadata(), Version: 99 };
    const future = createZip([
      {
        name: PROJECT_ARCHIVE_METADATA_ENTRY,
        bytes: new TextEncoder().encode(JSON.stringify(futureMetadata)),
      },
      { name: PROJECT_ARCHIVE_MIDI_ENTRY, bytes: midi },
    ]);
    await expect(deserializeProject(future)).rejects.toThrow("newer");
  });

  it("refuses invalid metadata during serialization", async () => {
    const document = createProjectDocument(
      createMidi(),
      createProjectMetadata(),
    );
    document.metadata.Chart.PreviewEnd = -1;
    await expect(serializeProject(document)).rejects.toThrow(
      "$.Chart.PreviewEnd",
    );
  });
});
