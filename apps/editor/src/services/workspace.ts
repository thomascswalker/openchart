import { StatefulService } from "../platform/services";
import type { FileSystemService } from "./filesystem";

interface Workspace {
  rootHandle?: FileSystemDirectoryHandle;
}

const DefaultWorkspace = {
  rootHandle: undefined,
} as Workspace;

export class WorkspaceService extends StatefulService<Workspace> {
  static dependencies = ["filesystem"];

  readonly #fs: FileSystemService;
  readonly #files: Map<string, File> = new Map();

  get rootUri(): string | undefined {
    return this._snapshot.rootHandle?.name;
  }

  get rootHandle(): FileSystemDirectoryHandle | undefined {
    return this._snapshot.rootHandle;
  }

  get files(): ReadonlyMap<string, File> {
    return this.#files;
  }

  constructor(fs: FileSystemService) {
    super();
    this.#fs = fs;
    this._snapshot = { ...DefaultWorkspace };
  }

  public override readonly reset = (): void => {
    this._snapshot = { ...DefaultWorkspace };
    this.notify();
  };

  public isValid(): boolean {
    return this._snapshot.rootHandle !== undefined;
  }

  public setHandle(handle?: FileSystemDirectoryHandle): void {
    if (handle) {
      this._snapshot.rootHandle = handle;
      this.notify();
      return;
    }

    this.#fs.readDirectory().then((entry) => {
      this._snapshot.rootHandle = entry.handle;
      this.notify();
    });
  }

  public async resolveFileHandle(
    path: string,
  ): Promise<FileSystemHandle | undefined> {
    if (!this._snapshot.rootHandle) {
      return undefined;
    }
    try {
      return await this._snapshot.rootHandle.getFileHandle(path);
    } catch {
      return undefined;
    }
  }

  public async loadFile(
    path: string,
    reload: boolean = false,
  ): Promise<File | undefined> {
    if (!reload && this.#files.has(path)) {
      return this.#files.get(path);
    }
    const fileHandle = await this.resolveFileHandle(path);
    if (!fileHandle || !(fileHandle instanceof FileSystemFileHandle)) {
      return undefined;
    }
    try {
      const file = await fileHandle.getFile();
      this.#files.set(path, file);
      return file;
    } catch {
      return undefined;
    }
  }

  public async unloadFile(path: string): Promise<void> {
    this.#files.delete(path);
  }
}

export interface IWorkspaceService extends WorkspaceService {}
