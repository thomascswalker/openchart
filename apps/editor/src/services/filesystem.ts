import type { ILoggerService } from "./logger";
import { IService } from "../platform/services";

export interface LoadFile {
  name: string;
  bytes: Uint8Array;
  handle: FileSystemFileHandle | null;
  directoryHandle?: FileSystemDirectoryHandle | null;
}

export interface SaveFile {
  name: string;
  handle: FileSystemFileHandle | null;
  directoryHandle?: FileSystemDirectoryHandle | null;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export class FileSystemService extends IService {
  static dependencies = ["logger"];

  private _logger: ILoggerService;

  constructor(logger: ILoggerService) {
    super();
    this._logger = logger;
  }

  public readonly reset = (): void => undefined;

  private download(bytes: Uint8Array, name: string, mimeType: string): void {
    const url = URL.createObjectURL(
      new Blob([toArrayBuffer(bytes)], { type: mimeType }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private async writeHandle(
    handle: FileSystemFileHandle,
    bytes: Uint8Array,
  ): Promise<void> {
    const writable = await handle.createWritable();
    await writable.write(toArrayBuffer(bytes));
    await writable.close();
  }

  public async readMidi(): Promise<LoadFile | null> {
    return this.read([
      {
        description: "MIDI files",
        accept: { "audio/midi": [".mid", ".midi"] },
      },
    ]);
  }

  public async writeMidi(
    bytes: Uint8Array,
    metadataJson: string,
    suggestedName: string,
    directoryHandle: FileSystemDirectoryHandle | null = null,
  ): Promise<SaveFile> {
    let targetDirectory = directoryHandle;
    if (!targetDirectory && typeof window.showDirectoryPicker === "function") {
      targetDirectory = await window.showDirectoryPicker({
        mode: "readwrite",
      });
    }

    if (!targetDirectory) {
      this.download(bytes, suggestedName, "audio/midi");
      this.download(
        new TextEncoder().encode(metadataJson),
        "info.json",
        "application/json",
      );
      const saved = {
        name: suggestedName,
        handle: null,
        directoryHandle: null,
      };
      this._logger.info(`Files saved: ${saved.name}, info.json`);
      return saved;
    }

    const midiHandle = await targetDirectory.getFileHandle(suggestedName, {
      create: true,
    });
    await this.writeHandle(midiHandle, bytes);
    const metadataHandle = await targetDirectory.getFileHandle("info.json", {
      create: true,
    });
    await this.writeHandle(
      metadataHandle,
      new TextEncoder().encode(metadataJson),
    );

    const saved = {
      name: midiHandle.name,
      handle: midiHandle,
      directoryHandle: targetDirectory,
    };
    this._logger.info(`Files saved: ${saved.name}, info.json`);
    return saved;
  }

  public async write(
    bytes: Uint8Array,
    suggestedName: string,
    types: FilePickerAcceptType[],
    mimeType: string,
    existingHandle: FileSystemFileHandle | null = null,
  ): Promise<SaveFile> {
    let saved: SaveFile;
    if (existingHandle) {
      const writable = await existingHandle.createWritable();
      await writable.write(toArrayBuffer(bytes));
      await writable.close();
      saved = { name: existingHandle.name, handle: existingHandle };
    } else if (this.isAccessible()) {
      const handle = await window.showSaveFilePicker!({
        types,
        suggestedName,
      });
      const writable = await handle.createWritable();
      await writable.write(toArrayBuffer(bytes));
      await writable.close();
      saved = { name: handle.name, handle };
    } else {
      this.download(bytes, suggestedName, mimeType);
      saved = { name: suggestedName, handle: null };
    }

    this._logger.info(`File saved to: ${saved.name}`);
    return saved;
  }

  public async read(
    types: FilePickerAcceptType[] = [],
  ): Promise<LoadFile | null> {
    if (this.isAccessible()) {
      const [handle] = await window.showOpenFilePicker!({ types });
      const file = await handle.getFile();
      const opened: LoadFile = {
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        handle,
      };
      this._logger.info(`File loaded: ${opened.name}`);
      return opened;
    }

    const opened = await new Promise<LoadFile | null>((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = types
        .flatMap((type) => Object.values(type.accept!).flat())
        .join(",");
      input.onchange = () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) {
          resolve(null);
          return;
        }
        void file.arrayBuffer().then(
          (buffer) =>
            resolve({
              name: file.name,
              bytes: new Uint8Array(buffer),
              handle: null,
            }),
          reject,
        );
      };
      input.click();
    });
    if (opened) this._logger.info(`File loaded: ${opened.name}`);
    return opened;
  }

  public isAccessible() {
    return (
      typeof window !== "undefined" &&
      typeof window.showOpenFilePicker === "function" &&
      typeof window.showSaveFilePicker === "function" &&
      window.origin !== null &&
      !(window.navigator?.userAgent ?? "").includes("Electron")
    );
  }
}
