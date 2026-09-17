export interface FileType {
  description: string;
  accept: Record<string, string[]>;
}

export interface OpenedFile {
  name: string;
  bytes: Uint8Array;
  handle: FileSystemFileHandle | null;
}

export interface SavedFile {
  name: string;
  handle: FileSystemFileHandle | null;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function"
  );
}

export function downloadBytes(
  bytes: Uint8Array,
  name: string,
  mimeType: string,
): void {
  const url = URL.createObjectURL(
    new Blob([toArrayBuffer(bytes)], { type: mimeType }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function saveBytes(
  bytes: Uint8Array,
  suggestedName: string,
  types: FileType[],
  mimeType: string,
  existingHandle: FileSystemFileHandle | null = null,
): Promise<SavedFile> {
  if (existingHandle) {
    const writable = await existingHandle.createWritable();
    await writable.write(toArrayBuffer(bytes));
    await writable.close();
    return { name: existingHandle.name, handle: existingHandle };
  }
  if (supportsFileSystemAccess()) {
    const handle = await window.showSaveFilePicker!({ types, suggestedName });
    const writable = await handle.createWritable();
    await writable.write(toArrayBuffer(bytes));
    await writable.close();
    return { name: handle.name, handle };
  }
  downloadBytes(bytes, suggestedName, mimeType);
  return { name: suggestedName, handle: null };
}

/** Opens bytes through File System Access when available, otherwise a temporary
 * browser file input. React components never need to own the input element. */
export function openFile(types: FileType[]): Promise<OpenedFile | null> {
  if (supportsFileSystemAccess()) {
    return window.showOpenFilePicker!({
      types: types as FilePickerAcceptType[],
    }).then(async ([handle]) => {
      const file = await handle.getFile();
      return {
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        handle,
      };
    });
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = types
      .flatMap((type) => Object.values(type.accept).flat())
      .join(",");
    input.onchange = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      void file.arrayBuffer().then((buffer) =>
        resolve({
          name: file.name,
          bytes: new Uint8Array(buffer),
          handle: null,
        }),
      );
    };
    input.click();
  });
}
