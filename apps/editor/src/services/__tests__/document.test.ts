import { Midi } from "@openchart/core";
import { describe, expect, it, vi } from "vitest";
import { DocumentService } from "../document";
import type { FileSystemService } from "../filesystem";
import type { ILoggerService } from "../logger";

function createDocumentService(
  fileSystem: Partial<FileSystemService> = {},
): DocumentService {
  return new DocumentService(
    { debug: vi.fn(), info: vi.fn() } as unknown as ILoggerService,
    fileSystem as FileSystemService,
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

  it("opens a MIDI file and binds its filename and handle", async () => {
    const midi = new Midi();
    midi.addTrack();
    const handle = { name: "opened.mid" } as FileSystemFileHandle;
    const service = createDocumentService({
      read: vi.fn(async () => ({
        name: "opened.mid",
        bytes: midi.toBuffer(),
        handle,
      })),
    });

    await expect(service.open()).resolves.toBe(true);

    const snapshot = service.getSnapshot();
    expect(snapshot.midiData?.trackCount).toBe(1);
    expect(snapshot.fileName).toBe("opened.mid");
    expect(snapshot.fileHandle).toBe(handle);
    expect(snapshot.isDirty).toBe(false);
  });
});
