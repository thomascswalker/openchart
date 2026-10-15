import { afterEach, describe, expect, it, vi } from "vitest";
import { FileSystemService } from "../filesystem";
import { midiFilePickerTypes } from "../document/types";
import type { LoggerService } from "../logger";

const TEST_FILENAME = "test_read_write.mid";

function makeMockFileSystemService() {
  return new FileSystemService({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    reset: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  } as unknown as LoggerService);
}

describe("FileSystemService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes and reads bytes through file picker handles", async () => {
    // Initialize a variable to store the bytes written to the mock file handle
    let storedBytes = new Uint8Array();

    // Mock file handle for testing read and write operations
    const fileHandle: FileSystemFileHandle = {
      name: TEST_FILENAME,
      async createWritable() {
        let pendingBytes = new Uint8Array();
        return {
          async write(data: ArrayBuffer) {
            pendingBytes = new Uint8Array(data);
          },
          async close() {
            storedBytes = pendingBytes;
          },
        };
      },
      async getFile() {
        return {
          name: TEST_FILENAME,
          arrayBuffer: async () => storedBytes.slice().buffer,
        } as File;
      },
    } as unknown as FileSystemFileHandle;

    // Mock anchor element for testing download link behavior
    const anchor = { click: vi.fn(), href: "", download: "" };

    // Stub global objects to simulate browser environment for file picker and download link
    vi.stubGlobal("window", {
      showSaveFilePicker: vi.fn(async () => fileHandle),
      showOpenFilePicker: vi.fn(async () => [fileHandle]),
    });
    vi.stubGlobal("document", { createElement: vi.fn(() => anchor) });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    });

    // Construct the FileSystemService instance, mocking the logger
    const service = makeMockFileSystemService();

    // Define the bytes to be written and read during the test
    const bytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64]);

    expect(service.isAccessible()).toBe(true);
    await expect(
      service.write(bytes, "export.mid", [], "audio/midi"),
    ).resolves.toEqual({ name: TEST_FILENAME, handle: fileHandle });
    await expect(service.read()).resolves.toEqual({
      name: TEST_FILENAME,
      bytes,
      handle: fileHandle,
    });
    expect(anchor.click).not.toHaveBeenCalled();
  });

  it("opens a MIDI file directly without selecting its containing folder", async () => {
    const bytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64]);
    const midiHandle = {
      name: "chart.mid",
      async getFile() {
        return {
          name: "chart.mid",
          arrayBuffer: async () => bytes.slice().buffer,
        } as File;
      },
    } as unknown as FileSystemFileHandle;
    const showOpenFilePicker = vi.fn(async () => [midiHandle]);
    const showDirectoryPicker = vi.fn();
    vi.stubGlobal("window", {
      showOpenFilePicker,
      showSaveFilePicker: vi.fn(),
      showDirectoryPicker,
    });
    const service = makeMockFileSystemService();

    const opened = await service.read(midiFilePickerTypes);
    expect(opened?.name).toBe("chart.mid");
    expect(opened?.bytes).toEqual(bytes);
    expect(opened?.handle).toBe(midiHandle);
    expect(opened?.directoryHandle).toBeUndefined();
    expect(showOpenFilePicker).toHaveBeenCalledWith({
      types: midiFilePickerTypes,
    });
    expect(showDirectoryPicker).not.toHaveBeenCalled();
  });

  it("returns a path relative to the supplied project directory", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fileHandle = {
      name: "song.wav",
      async getFile() {
        return {
          name: "song.wav",
          arrayBuffer: async () => bytes.slice().buffer,
        } as File;
      },
    } as unknown as FileSystemFileHandle;
    const projectDirectory = {
      resolve: vi.fn(async () => ["audio", "song.wav"]),
    } as unknown as FileSystemDirectoryHandle;
    vi.stubGlobal("window", {
      showOpenFilePicker: vi.fn(async () => [fileHandle]),
      showSaveFilePicker: vi.fn(),
    });
    const service = makeMockFileSystemService();

    await expect(service.read([], projectDirectory)).resolves.toMatchObject({
      name: "song.wav",
      relativePath: "audio/song.wav",
      bytes,
      handle: fileHandle,
    });
    expect(projectDirectory.resolve).toHaveBeenCalledWith(fileHandle);
  });

  it("rejects files outside the supplied project directory", async () => {
    const fileHandle = {
      name: "song.wav",
      async getFile() {
        return {
          name: "song.wav",
          arrayBuffer: async () => new ArrayBuffer(0),
        } as File;
      },
    } as unknown as FileSystemFileHandle;
    const projectDirectory = {
      resolve: vi.fn(async () => null),
    } as unknown as FileSystemDirectoryHandle;
    vi.stubGlobal("window", {
      showOpenFilePicker: vi.fn(async () => [fileHandle]),
      showSaveFilePicker: vi.fn(),
    });
    const service = makeMockFileSystemService();

    await expect(service.read([], projectDirectory)).rejects.toThrow(
      "Choose an audio file inside the project folder.",
    );
  });
});
