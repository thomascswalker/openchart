import { StatefulService } from "../platform/services";
import { FileTreeModel } from "../models/tree/fileTree";
import {
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
} from "native-file-system-adapter";

export interface WorkspaceSnapshot {
  /** The file tree representing the structure of the workspace. */
  tree?: FileTreeModel;
  /** A map of file paths to their corresponding file handles within the workspace. */
  files: Map<string, FileSystemFileHandle>;
}

export const DefaultWorkspaceSnapshot = {
  tree: undefined,
  files: new Map(),
} as WorkspaceSnapshot;

/**
 * Defines the workspace's root directory and manages the files within it. This
 * allows any part of the application to access and manage files within the
 * workspace without requiring additional dialogs for each time a file is
 * accessed.
 */
export class WorkspaceService extends StatefulService<WorkspaceSnapshot> {
  constructor() {
    super();
    this.snapshot = { ...DefaultWorkspaceSnapshot };
  }

  public override readonly reset = (): void => {
    this.snapshot = { ...DefaultWorkspaceSnapshot };
    this.notify();
  };

  public isValid(): boolean {
    return !!this.snapshot.tree;
  }

  public async setRootHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    this.snapshot.tree = new FileTreeModel(handle);
    this.notify();
  }

  public async loadFile(
    path: string,
    reload: boolean = false,
  ): Promise<File | undefined> {
    if (!reload && this.snapshot.files.has(path)) {
      return await this.snapshot.files.get(path)?.getFile();
    }
    if (!this.snapshot.tree) {
      return undefined;
    }
    const fileHandle = this.snapshot.tree.findFile(path);
    if (!fileHandle) {
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
