import { Midi } from "@openchart/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentService } from "../document";
import type { FileSystemService } from "../filesystem";
import type { LoggerService } from "../logger";
import { makeDefaultMetadata } from "../document/schema";

function createDocumentService(
  fileSystem: Partial<FileSystemService> = {},
): DocumentService {
  return new DocumentService(
    { debug: vi.fn(), info: vi.fn() } as unknown as LoggerService,
    fileSystem as FileSystemService,
  );
}

describe("DocumentService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("owns MIDI data, project metadata, dirty state, and history", () => {
    const service = createDocumentService();
    const midi = new Midi();
    midi.addTrack();
    service.data = midi;
    service.isDirty = false;

    midi.tracks[0]?.addNote(60, 0, 100, 120);
    service.recordEdit();
    expect(service.getSnapshot().canUndo).toBe(true);
    expect(service.getSnapshot().isDirty).toBe(true);

    service.undoEdit();
    expect(service.getSnapshot().midi?.tracks[0]?.getNotes()).toHaveLength(0);
    expect(service.getSnapshot().canRedo).toBe(true);
  });

  it("does not dirty an empty edit transaction", () => {
    const service = createDocumentService();
    service.isDirty = false;
    service.beginEdit();
    service.endEdit();

    expect(service.getSnapshot().isDirty).toBe(false);
    expect(service.getSnapshot().canUndo).toBe(false);
  });

  it("opens a MIDI file with default metadata", async () => {
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
    expect(snapshot.midi?.trackCount).toBe(1);
    expect(snapshot.file).toBe("opened.mid");
    expect(snapshot.handle).toBe(handle);
    expect(snapshot.directoryHandle).toBeNull();
    expect(snapshot.metadata).toMatchObject(makeDefaultMetadata());
    expect(snapshot.isDirty).toBe(false);
  });

  it("saves MIDI and metadata using state owned by the document", async () => {
    const midi = new Midi();
    midi.addTrack();
    const writtenFiles = new Map<string, Uint8Array>();
    const directoryHandle = {
      async getFileHandle(name: string) {
        return {
          name,
          async createWritable() {
            let bytes = new Uint8Array();
            return {
              async write(value: ArrayBuffer) {
                bytes = new Uint8Array(value);
              },
              async close() {
                writtenFiles.set(name, bytes);
              },
            };
          },
        };
      },
    } as unknown as FileSystemDirectoryHandle;
    const service = createDocumentService();
    service.data = midi;
    service.rebind("saved.mid", null, directoryHandle);

    await expect(service.save()).resolves.toBe(true);

    expect(writtenFiles.get("saved.mid")).toEqual(midi.toBuffer());
    expect(
      JSON.parse(new TextDecoder().decode(writtenFiles.get("info.json"))),
    ).toEqual(service.metadata);
    expect(service.getSnapshot()).toMatchObject({
      file: "saved.mid",
      handle: { name: "saved.mid" },
      directoryHandle,
      isDirty: false,
    });
  });

  it("creates and writes the project files in the directory chosen by Save As", async () => {
    const midi = new Midi();
    midi.addTrack();
    const writtenFiles = new Map<string, Uint8Array>();
    const directoryHandle = {
      async getFileHandle(name: string) {
        return {
          name,
          async createWritable() {
            let bytes = new Uint8Array();
            return {
              async write(value: ArrayBuffer) {
                bytes = new Uint8Array(value);
              },
              async close() {
                writtenFiles.set(name, bytes);
              },
            };
          },
        };
      },
    } as unknown as FileSystemDirectoryHandle;
    vi.stubGlobal("window", {
      showDirectoryPicker: vi.fn(async () => directoryHandle),
    });
    const service = createDocumentService();
    service.data = midi;

    await expect(service.saveAs()).resolves.toBe(true);

    expect([...writtenFiles.keys()]).toEqual(["untitled.mid", "info.json"]);
    expect(writtenFiles.get("untitled.mid")).toEqual(midi.toBuffer());
    expect(
      JSON.parse(new TextDecoder().decode(writtenFiles.get("info.json"))),
    ).toEqual(service.metadata);
  });
});
