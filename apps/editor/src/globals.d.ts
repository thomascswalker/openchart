import type {
  FileSystemDirectoryHandle as AdapterDirectoryHandle,
  FileSystemFileHandle as AdapterFileHandle,
} from 'native-file-system-adapter';

declare global {
  // Merge the adapter's members into the DOM handle types so the global names
  // resolve to the adapter's shape without importing them in every file.
  interface FileSystemFileHandle extends AdapterFileHandle {}
  interface FileSystemDirectoryHandle extends AdapterDirectoryHandle {}

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

  const __APP_VERSION__: string;

  interface Window {
    __captureFramebuffer?: boolean;
    __framebufferPng?: string;
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
