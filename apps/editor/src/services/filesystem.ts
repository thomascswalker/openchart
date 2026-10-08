import type { ILoggerService } from "./logger";
import { IService } from "../platform/services";

const DEFAULT_PATH = "untitled.mid";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export class FileSystemService extends IService {
  static dependencies = ["logger"];

  private _logger: ILoggerService;
  private _path: string;
  private _handle: FileSystemFileHandle | null;

  constructor(logger: ILoggerService) {
    super();
    this._logger = logger;
    this._path = DEFAULT_PATH;
    this._handle = null;
  }

  public readonly reset = (): void => {
    this._path = DEFAULT_PATH;
    this._handle = null;
    this.notify();
  };

  private download(bytes: Uint8Array): void {
    const url = URL.createObjectURL(
      new Blob([toArrayBuffer(bytes)], { type: "application/octet-stream" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = this._path;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  public async save(
    data: Uint8Array,
    types: FilePickerAcceptType[] = [],
  ): Promise<boolean> {
    if (!this.isAccessible()) {
      this._logger.error("File system access is not available.");
      return false;
    }
    if (this._handle === null) {
      this._handle = await window.showSaveFilePicker!({
        types,
        suggestedName: this._path,
      });
    }
    const writeable = await this._handle.createWritable();
    await writeable.write(toArrayBuffer(data));
    await writeable.close();
    this.download(data);
    this._logger.info(`Document saved to: ${this._path}`);
    this.notify();
    return true;
  }

  public async load(
    types: FilePickerAcceptType[] = [],
  ): Promise<Uint8Array | null> {
    if (!this.isAccessible()) {
      this._logger.error("File system access is not available.");
      return null;
    }
    let data: Uint8Array | null = null;
    await window.showOpenFilePicker!({ types }).then(async ([handle]) => {
      const file = await handle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      data = new Uint8Array(arrayBuffer);
    });
    if (!data) {
      this._logger.error(`Failed to load document: ${this._path}`);
    } else {
      this.notify();
    }
    return data;
  }

  public isAccessible() {
    return (
      typeof window !== "undefined" &&
      typeof window.showOpenFilePicker === "function" &&
      typeof window.showSaveFilePicker === "function"
    );
  }

  public setPath(path: string) {
    this._path = path;
    this._logger.debug(`Document path set to: ${this._path}`);
    this.notify();
  }
  public getPath() {
    return this._path;
  }
}
