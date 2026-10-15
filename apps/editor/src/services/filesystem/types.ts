export interface LoadFile {
  name: string;
  relativePath?: string;
  bytes: Uint8Array;
  handle: FileSystemFileHandle | null;
  directoryHandle?: FileSystemDirectoryHandle | null;
}

export interface LoadDirectory {
  name: string;
  relativePath: string;
  handle: FileSystemDirectoryHandle;
}

export interface ProjectFiles {
  metadataBytes: Uint8Array;
  midiBytes: Uint8Array;
  midiHandle: FileSystemFileHandle;
  directoryHandle: FileSystemDirectoryHandle;
}

export interface SaveFile {
  name: string;
  handle: FileSystemFileHandle | null;
  directoryHandle?: FileSystemDirectoryHandle | null;
}
