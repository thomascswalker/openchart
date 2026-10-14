import { Midi } from "@openchart/core";
import { describe, expect, it, vi } from "vitest";
import { DocumentService } from "../document";
import type { FileSystemService } from "../filesystem";
import type { LoggerService } from "../logger";

function createDocumentService(
  fileSystem: Partial<FileSystemService> = {},
): DocumentService {
  return new DocumentService(
    { debug: vi.fn(), info: vi.fn() } as unknown as LoggerService,
    fileSystem as FileSystemService,
  );
}

describe("DocumentService", () => {
  it("owns MIDI data, project metadata, dirty state, and history", () => {
    const service = createDocumentService();
    const midi = new Midi();
    midi.addTrack();
    service.data = midi;
    service.isDirty = false;

    midi.tracks[0]?.addNote(60, 0, 100, 120);
    service.recordOpenChart();
    expect(service.getSnapshot().canUndo).toBe(true);
    expect(service.getSnapshot().isDirty).toBe(true);

    service.undoOpenChart();
    expect(service.getSnapshot().midi?.tracks[0]?.getNotes()).toHaveLength(0);
    expect(service.getSnapshot().canRedo).toBe(true);
  });

  it("does not dirty an empty edit transaction", () => {
    const service = createDocumentService();
    service.isDirty = false;
    service.beginOpenChart();
    service.endOpenChart();

    expect(service.getSnapshot().isDirty).toBe(false);
    expect(service.getSnapshot().canUndo).toBe(false);
  });

  it("opens a MIDI file with default metadata", async () => {
    const midi = new Midi();
    midi.addTrack();
    const handle = { name: "opened.mid" } as FileSystemFileHandle;
    const service = createDocumentService({
      readMidi: vi.fn(async () => ({
        name: "opened.mid",
        bytes: midi.toBuffer(),
        handle,
      })),
    });

    await expect(service.open()).resolves.toBe(true);

    const snapshot = service.getSnapshot();
    expect(snapshot.midi?.trackCount).toBe(1);
    expect(snapshot.file).toBe("opened.mid");
    expect(snapshot.handle).toBe(handle);
    expect(snapshot.directoryHandle).toBeNull();
    expect(snapshot.metadata).toMatchObject({
      version: 1,
      song: {
        name: "",
        artist: "",
        album: "",
        genre: "",
      },
    });
    expect(snapshot.metadata.id).toEqual(expect.any(String));
    expect(snapshot.isDirty).toBe(false);
  });
});
