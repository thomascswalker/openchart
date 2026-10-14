import { afterEach, describe, expect, it, vi } from "vitest";
import { FileSystemService } from "../filesystem";

const TEST_FILENAME = "test_read_write.mid";

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
    const service = new FileSystemService({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      reset: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    });

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

  it("reads and writes MIDI metadata beside the selected MIDI file", async () => {
    const storedFiles = new Map<string, Uint8Array>([
      ["chart.mid", new Uint8Array([0x4d, 0x54, 0x68, 0x64])],
      ["info.json", new TextEncoder().encode('{"version":1}')],
    ]);
    const makeFileHandle = (name: string): FileSystemFileHandle =>
      ({
        name,
        kind: "file",
        async getFile() {
          return {
            name,
            arrayBuffer: async () =>
              storedFiles.get(name)!.slice().buffer as ArrayBuffer,
          } as File;
        },
        async createWritable() {
          let bytes = new Uint8Array();
          return {
            async write(value: ArrayBuffer) {
              bytes = new Uint8Array(value);
            },
            async close() {
              storedFiles.set(name, bytes);
            },
          };
        },
      }) as unknown as FileSystemFileHandle;
    const midiHandle = makeFileHandle("chart.mid");
    const metadataHandle = makeFileHandle("info.json");
    const directoryHandle = {
      async *values() {
        yield midiHandle;
        yield metadataHandle;
      },
      async getFileHandle(name: string) {
        return makeFileHandle(name);
      },
    } as unknown as FileSystemDirectoryHandle;

    vi.stubGlobal("window", {
      showDirectoryPicker: vi.fn(async () => directoryHandle),
    });
    const service = new FileSystemService({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      reset: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    });

    const opened = await service.readMidi();
    expect(opened?.name).toBe("chart.mid");
    expect(opened?.metadataBytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(opened!.metadataBytes!)).toBe(
      '{"version":1}',
    );

    const saved = await service.writeMidi(
      new Uint8Array([1, 2, 3]),
      '{"version":2}',
      "chart.mid",
      directoryHandle,
    );
    expect(saved.directoryHandle).toBe(directoryHandle);
    expect(storedFiles.get("chart.mid")).toEqual(new Uint8Array([1, 2, 3]));
    expect(new TextDecoder().decode(storedFiles.get("info.json"))).toBe(
      '{"version":2}',
    );
  });
});
