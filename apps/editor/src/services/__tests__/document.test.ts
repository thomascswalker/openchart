import { Midi } from "@openchart/core";
import { describe, expect, it, vi } from "vitest";
import { DocumentService } from "../document";
import type { FileSystemService } from "../filesystem";
import type { ILoggerService } from "../logger";

function createDocumentService(): DocumentService {
  return new DocumentService(
    { debug: vi.fn() } as unknown as ILoggerService,
    {} as FileSystemService,
  );
}

describe("DocumentService", () => {
  it("owns MIDI data, project metadata, dirty state, and history", () => {
    const service = createDocumentService();
    const midi = new Midi();
    midi.addTrack();
    service.setMidiData(midi);
    service.setClean();

    midi.tracks[0]?.addNote(60, 0, 100, 120);
    service.recordOpenChart();
    expect(service.getSnapshot().canUndoMidi).toBe(true);
    expect(service.getSnapshot().isDirty).toBe(true);

    service.undoOpenChart();
    expect(service.getSnapshot().midiData?.tracks[0]?.getNotes()).toHaveLength(
      0,
    );
    expect(service.getSnapshot().canRedoMidi).toBe(true);
    expect(service.getSnapshot().projectDocument).not.toBeNull();
  });

  it("does not dirty an empty edit transaction", () => {
    const service = createDocumentService();
    service.setClean();
    service.beginOpenChart();
    service.endOpenChart();

    expect(service.getSnapshot().isDirty).toBe(false);
    expect(service.getSnapshot().canUndoMidi).toBe(false);
  });
});
