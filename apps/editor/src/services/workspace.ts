import { StatefulService } from "../platform/services";
import type { FileSystemService } from "./filesystem";

class FileTree {
  root: FileSystemDirectoryHandle | undefined = undefined;
  entries: Record<string, FileTree | FileSystemFileHandle> = {};

  constructor(root?: FileSystemDirectoryHandle) {
    this.root = root;
    this.sync();
  }

  public async sync(): Promise<void> {
    if (!this.root) {
      this.entries = {};
      return;
    }
    const buildTree = async (
      dir: FileSystemDirectoryHandle,
    ): Promise<Record<string, FileTree | FileSystemFileHandle>> => {
      const entries: Record<string, FileTree | FileSystemFileHandle> = {};
      for await (const entry of dir.values()) {
        if (entry.kind === "file") {
          entries[entry.name] = entry;
        } else if (entry.kind === "directory") {
          const dirEntry = new FileTree(entry);
          await dirEntry.sync();
          entries[entry.name] = dirEntry;
        }
      }
      return entries;
    };
    this.entries = await buildTree(this.root);
  }

  public async get(
    path: string,
  ): Promise<FileSystemDirectoryHandle | FileSystemFileHandle | undefined> {
    const parts = path.split("/");
    let current: FileSystemDirectoryHandle | FileSystemFileHandle | undefined =
      this.root;
    if (!current) {
      return undefined;
    }
    for (const part of parts) {
      const isFile = part.includes(".");
      if (current instanceof FileSystemDirectoryHandle) {
        if (isFile) {
          current = await current.getFileHandle(part).catch(() => undefined);
        } else {
          current = await current
            .getDirectoryHandle(part)
            .catch(() => undefined);
        }
        continue;
      }
    }
    return current;
  }
}

interface Workspace {
  /** The root directory handle of the workspace. */
  rootHandle?: FileSystemDirectoryHandle;
  /** The file tree representing the structure of the workspace. */
  tree: FileTree;
  /** A map of file paths to their corresponding file handles within the workspace. */
  files: Map<string, FileSystemFileHandle>;
}

const DefaultWorkspace = {
  rootHandle: undefined,
  tree: new FileTree(),
  files: new Map(),
} as Workspace;

/**
 * Defines the workspace's root directory and manages the files within it. This
 * allows any part of the application to access and manage files within the
 * workspace without requiring additional dialogs for each time a file is
 * accessed.
 */
export class WorkspaceService extends StatefulService<Workspace> {
  static dependencies = ["filesystem"];

  readonly #fs: FileSystemService;

  constructor(fs: FileSystemService) {
    super();
    this.#fs = fs;
    this.snapshot = { ...DefaultWorkspace };
  }

  public override readonly reset = (): void => {
    this.snapshot = { ...DefaultWorkspace };
    this.notify();
  };

  public isValid(): boolean {
    return this.snapshot.rootHandle !== undefined;
  }

  private async discover(): Promise<void> {
    if (!this.snapshot.rootHandle) {
      this.snapshot.tree = new FileTree();
      return;
    }

    const newTree = new FileTree(this.snapshot.rootHandle);
    await newTree.sync();
    this.snapshot.tree = newTree;
  }

  public setRootHandle(handle?: FileSystemDirectoryHandle): void {
    if (handle) {
      this.snapshot.rootHandle = handle;
    } else {
      this.#fs.readDirectory().then((entry) => {
        this.snapshot.rootHandle = entry.handle;
      });
    }
    this.discover().then(() => this.notify());
  }

  public async resolveFileHandle(
    path: string,
  ): Promise<FileSystemHandle | undefined> {
    if (!this.snapshot.rootHandle) {
      return undefined;
    }
    try {
      return await this.snapshot.rootHandle.getFileHandle(path);
    } catch {
      return undefined;
    }
  }

  public async loadFile(
    path: string,
    reload: boolean = false,
  ): Promise<File | undefined> {
    if (!reload && this.snapshot.files.has(path)) {
      return await this.snapshot.files.get(path)?.getFile();
    }
    const fileHandle = await this.resolveFileHandle(path);
    if (!fileHandle || !(fileHandle instanceof FileSystemFileHandle)) {
      return undefined;
    }
    try {
      this.snapshot.files.set(path, fileHandle);
      return await fileHandle.getFile();
    } catch {
      return undefined;
    }
  }

  public async unloadFile(path: string): Promise<void> {
    this.snapshot.files.delete(path);
  }
}

export interface IWorkspaceService extends WorkspaceService {}
