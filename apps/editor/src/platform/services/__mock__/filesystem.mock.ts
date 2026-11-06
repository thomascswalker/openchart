import { vi } from "vitest";
import { type FileSystemService } from "../filesystem";

type IFileSystemService = FileSystemService;

export function mockFileSystemService() {
  return {
    reset: vi.fn(),
    write: vi.fn(),
    read: vi.fn(),
    readDirectory: vi.fn(),
    readProject: vi.fn(),
    isAccessible: vi.fn(),
  } as unknown as IFileSystemService;
}
