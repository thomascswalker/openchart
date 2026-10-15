export interface LoadFile {
  name: string;
  relativePath?: string;
  bytes: Uint8Array;
  handle: FileSystemFileHandle | null;
  directoryHandle?: FileSystemDirectoryHandle | null;
}

export interface SaveFile {
  name: string;
  handle: FileSystemFileHandle | null;
  directoryHandle?: FileSystemDirectoryHandle | null;
}
