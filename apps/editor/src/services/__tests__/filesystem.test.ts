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
    });

    // Define the bytes to be written and read during the test
    const bytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64]);

    expect(service.isAccessible()).toBe(true);
    expect(await service.save(bytes)).toBe(true);
    expect(await service.load()).toEqual(bytes);
    expect(anchor.click).toHaveBeenCalledOnce();
  });
});
