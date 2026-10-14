import type { ILoggerService } from "./logger";
import { IService } from "../platform/services";

export interface LoadFile {
  name: string;
  bytes: Uint8Array;
  handle: FileSystemFileHandle | null;
  directoryHandle?: FileSystemDirectoryHandle | null;
  metadataBytes?: Uint8Array | null;
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

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
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

  private async readMidiDirectory(
    directoryHandle: FileSystemDirectoryHandle,
  ): Promise<LoadFile | null> {
    const midiHandles: FileSystemFileHandle[] = [];
    for await (const handle of directoryHandle.values()) {
      if (handle.kind === "file" && /\.(mid|midi)$/i.test(handle.name)) {
        midiHandles.push(handle as FileSystemFileHandle);
      }
    }

    const midiHandle = this.selectMidiHandle(midiHandles);
    if (!midiHandle) return null;

    const midiFile = await midiHandle.getFile();
    let metadataBytes: Uint8Array | null = null;
    try {
      const metadataHandle = await directoryHandle.getFileHandle("info.json");
      const metadataFile = await metadataHandle.getFile();
      metadataBytes = new Uint8Array(await metadataFile.arrayBuffer());
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }

    const opened: LoadFile = {
      name: midiHandle.name,
      bytes: new Uint8Array(await midiFile.arrayBuffer()),
      handle: midiHandle,
      directoryHandle,
      metadataBytes,
    };
    this._logger.info(`File loaded: ${opened.name}`);
    return opened;
  }

  private selectMidiHandle(
    handles: FileSystemFileHandle[],
  ): FileSystemFileHandle | null {
    if (handles.length === 0) {
      throw new Error("The selected folder does not contain a MIDI file.");
    }
    if (handles.length === 1) return handles[0]!;

    const selectedName = window.prompt(
      `Choose a MIDI file from the selected folder:\n${handles
        .map((handle) => handle.name)
        .join("\n")}`,
      handles[0]!.name,
    );
    if (!selectedName) return null;
    const selected = handles.find((handle) => handle.name === selectedName);
    if (!selected) {
      throw new Error("Choose one of the MIDI files listed.");
    }
    return selected;
  }

  private async readMidiFolderInput(): Promise<LoadFile | null> {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".mid,.midi,.json";
      input.setAttribute("webkitdirectory", "");
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        input.remove();
        const midiFiles = files.filter((file) =>
          /\.(mid|midi)$/i.test(file.name),
        );
        if (midiFiles.length === 0) {
          reject(
            new Error("The selected folder does not contain a MIDI file."),
          );
          return;
        }

        let midiFile = midiFiles[0]!;
        if (midiFiles.length > 1) {
          const selectedName = window.prompt(
            `Choose a MIDI file from the selected folder:\n${midiFiles
              .map((file) => file.name)
              .join("\n")}`,
            midiFile.name,
          );
          if (!selectedName) {
            resolve(null);
            return;
          }
          const selected = midiFiles.find((file) => file.name === selectedName);
          if (!selected) {
            reject(new Error("Choose one of the MIDI files listed."));
            return;
          }
          midiFile = selected;
        }

        const parentPath = midiFile.webkitRelativePath
          .split("/")
          .slice(0, -1)
          .join("/");
        const metadataPath = parentPath
          ? `${parentPath}/info.json`
          : "info.json";
        const metadataFile = files.find(
          (file) => file.webkitRelativePath === metadataPath,
        );
        void Promise.all([
          midiFile.arrayBuffer(),
          metadataFile?.arrayBuffer(),
        ]).then(([bytes, metadataBytes]) => {
          const opened: LoadFile = {
            name: midiFile.name,
            bytes: new Uint8Array(bytes),
            handle: null,
            directoryHandle: null,
            metadataBytes: metadataBytes ? new Uint8Array(metadataBytes) : null,
          };
          this._logger.info(`File loaded: ${opened.name}`);
          resolve(opened);
        }, reject);
      };
      input.click();
    });
  }

  public async readMidi(): Promise<LoadFile | null> {
    if (typeof window.showDirectoryPicker === "function") {
      const directoryHandle = await window.showDirectoryPicker({
        mode: "readwrite",
      });
      return this.readMidiDirectory(directoryHandle);
    }
    return this.readMidiFolderInput();
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
