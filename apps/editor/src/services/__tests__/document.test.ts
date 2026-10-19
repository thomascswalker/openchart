import { Midi } from "@openchart/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentService, type OpenedProject } from "../document";
import type { LoggerService } from "../logger";
import { makeDefaultMetadata } from "../document/schema";
import { ProjectFilePickerTypes } from "../document/types";

const DefaultOpenedProject: OpenedProject = {
  metadataBytes: new Uint8Array(),
  metadataHandle: {} as FileSystemFileHandle,
  midiBytes: new Uint8Array(),
  midiHandle: {} as FileSystemFileHandle,
  directoryHandle: {} as FileSystemDirectoryHandle,
};
function createDocumentService(
  openedProject: OpenedProject = { ...DefaultOpenedProject },
): DocumentService {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  } as unknown as LoggerService;
  const service = new DocumentService(logger);

  Object.assign(service, {
    readProject: vi.fn(async () => openedProject),
  });
  return service;
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

  it("opens metadata JSON with adjacent notes.mid", async () => {
    const midi = new Midi();
    midi.addTrack();
    const metadataHandle = { name: "info.json" } as FileSystemFileHandle;
    const midiHandle = { name: "notes.mid" } as FileSystemFileHandle;
    const directoryHandle = {} as FileSystemDirectoryHandle;
    const metadata = makeDefaultMetadata();
    metadata.song.name = "Opened project";

    const openedProject: OpenedProject = {
      metadataHandle,
      metadataBytes: new TextEncoder().encode(JSON.stringify(metadata)),
      midiHandle,
      midiBytes: midi.toBuffer() as Uint8Array<ArrayBuffer>,
      directoryHandle,
    };

    const service = createDocumentService(openedProject);
    await expect(service.open()).resolves.toBe(true);

    const snapshot = service.getSnapshot();
    expect(snapshot.midi?.trackCount).toBe(1);
    expect(snapshot.file).toBe("notes.mid");
    expect(snapshot.handle).toBe(midiHandle);
    expect(snapshot.directoryHandle).toBe(directoryHandle);
    expect(snapshot.metadata).toEqual(metadata);
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

    expect(writtenFiles.get("notes.mid")).toEqual(midi.toBuffer());
    expect(
      JSON.parse(new TextDecoder().decode(writtenFiles.get("info.json"))),
    ).toEqual(service.metadata);
    expect(service.getSnapshot()).toMatchObject({
      file: "notes.mid",
      handle: { name: "notes.mid" },
      directoryHandle,
      isDirty: false,
    });
  });

  it("loads notes.mid next to the selected project JSON file", async () => {
    const metadataBytes = new TextEncoder().encode("{}");
    const midiBytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64]);
    const metadataHandle = {
      name: "info.json",
      async getFile() {
        return {
          name: "info.json",
          arrayBuffer: async () => metadataBytes.slice().buffer,
        } as File;
      },
    } as unknown as FileSystemFileHandle;
    const midiHandle = {
      name: "notes.mid",
      async getFile() {
        return {
          name: "notes.mid",
          arrayBuffer: async () => midiBytes.slice().buffer,
        } as File;
      },
    } as unknown as FileSystemFileHandle;
    const directoryHandle = {
      resolve: vi.fn(async () => ["info.json"]),
      getFileHandle: vi.fn(async () => midiHandle),
    } as unknown as FileSystemDirectoryHandle;
    const showOpenFilePicker = vi.fn(async () => [metadataHandle]);
    const showDirectoryPicker = vi.fn(async () => directoryHandle);
    vi.stubGlobal("window", {
      origin: "https://example.test",
      showOpenFilePicker,
      showSaveFilePicker: vi.fn(),
      showDirectoryPicker,
    });

    const service = new DocumentService({
      debug: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    } as unknown as LoggerService);
    await expect(service.readProject()).resolves.toEqual({
      metadataBytes,
      midiBytes,
      metadataHandle,
      midiHandle,
      directoryHandle,
    });
    expect(showOpenFilePicker).toHaveBeenCalledWith({
      types: ProjectFilePickerTypes,
    });
    expect(showDirectoryPicker).toHaveBeenCalledWith({ mode: "read" });
    expect(directoryHandle.getFileHandle).toHaveBeenCalledWith("notes.mid");
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

    expect([...writtenFiles.keys()]).toEqual(["notes.mid", "info.json"]);
    expect(writtenFiles.get("notes.mid")).toEqual(midi.toBuffer());
    expect(
      JSON.parse(new TextDecoder().decode(writtenFiles.get("info.json"))),
    ).toEqual(service.metadata);
  });
});
