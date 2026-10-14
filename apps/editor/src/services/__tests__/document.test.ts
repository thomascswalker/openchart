import { Midi } from "@openchart/core";
import { describe, expect, it, vi } from "vitest";
import { DocumentService } from "../document";
import { makeDefaultMetadata, metadataSchema } from "../document/schema";
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

  it("opens MIDI and its sidecar metadata and binds the folder", async () => {
    const midi = new Midi();
    midi.addTrack();
    const handle = { name: "opened.mid" } as FileSystemFileHandle;
    const directoryHandle = {} as FileSystemDirectoryHandle;
    const metadata = makeDefaultMetadata();
    metadata.song.name = "Song name";
    const service = createDocumentService({
      readMidi: vi.fn(async () => ({
        name: "opened.mid",
        bytes: midi.toBuffer(),
        handle,
        directoryHandle,
        metadataBytes: new TextEncoder().encode(JSON.stringify(metadata)),
      })),
    });

    await expect(service.open()).resolves.toBe(true);

    const snapshot = service.getSnapshot();
    expect(snapshot.midi?.trackCount).toBe(1);
    expect(snapshot.file).toBe("opened.mid");
    expect(snapshot.handle).toBe(handle);
    expect(snapshot.directoryHandle).toBe(directoryHandle);
    expect(snapshot.metadata).toEqual(metadataSchema.parse(metadata));
    expect(snapshot.isDirty).toBe(false);
  });
});
