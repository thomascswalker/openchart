declare global {
  interface FileSystemHandle {
    kind: 'file' | 'directory';
    name: string;
  }

  interface FileSystemFileHandle extends FileSystemHandle {
    kind: 'file';
  }

  interface FileSystemDirectoryHandle extends FileSystemHandle {
    kind: 'directory';
    values(): AsyncIterable<FileSystemHandle>;
    getFileHandle(
      name: string,
      options?: { create?: boolean },
    ): Promise<FileSystemFileHandle>;
    getDirectoryHandle(
      name: string,
      options?: { create?: boolean },
    ): Promise<FileSystemDirectoryHandle>;
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
    resolve(possibleDescendant?: FileSystemHandle): Promise<string[] | null>;
  }

  interface FilePickerAcceptType {
    description?: string;
    accept?: Record<string, string | string[]>;
  }

  interface FilePickerOptions {
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
    id?: string;
    startIn?: unknown;
  }

  interface OpenFilePickerOptions extends FilePickerOptions {
    multiple?: boolean;
  }

  interface SaveFilePickerOptions extends FilePickerOptions {
    suggestedName?: string;
  }

  interface DirectoryPickerOptions {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: unknown;
  }

  interface Window {
    showDirectoryPicker: (
      options?: DirectoryPickerOptions,
    ) => Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker: (
      options?: OpenFilePickerOptions,
    ) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker: (
      options?: SaveFilePickerOptions,
    ) => Promise<FileSystemFileHandle>;
  }
}

export {};
