import { FileTreeModel } from '../../../models/tree/fileTree';
import { createDecorator } from '../service';
import { StatefulService } from '../statefulService';

export interface WorkspaceSnapshot {
  /** The file tree representing the structure of the workspace. */
  tree?: FileTreeModel;
  /** A map of file paths to their corresponding file handles within the workspace. */
  files: Map<string, FileSystemFileHandle>;
}

/**
 * Defines the workspace's root directory and manages the files within it. This
 * allows any part of the application to access and manage files within the
 * workspace without requiring additional dialogs for each time a file is
 * accessed.
 */
export class WorkspaceService extends StatefulService<WorkspaceSnapshot> {
  #rootHandle?: FileSystemDirectoryHandle;

  public static defaultSnapshot(): WorkspaceSnapshot {
    return {
      tree: undefined,
      files: new Map(),
    };
  }

  public override reset(): void {
    this.#rootHandle = undefined;
    this._snapshot = WorkspaceService.defaultSnapshot();
    this.notify();
  }

  public isValid(): boolean {
    return !!this._snapshot.tree;
  }

  public getRootHandle(): FileSystemDirectoryHandle | undefined {
    return this.#rootHandle;
  }

  /**
   * Prompts the user to select a directory and sets it as the workspace root.
   *
   * If the user cancels the selection, no changes are made to the workspace
   * root.
   */
  public async showSetDirectory(): Promise<void> {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      await this.setDirectory(handle as unknown as FileSystemDirectoryHandle);
    } catch (error) {
      // The user dismissing the picker is not an error.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        throw error;
      }
    }
  }

  /**
   * Sets the given directory as the workspace root.
   *
   * @param handle The directory handle to set as the workspace root.
   */
  public async setDirectory(handle: FileSystemDirectoryHandle): Promise<void> {
    this.#rootHandle = handle;
    // A new snapshot object is required so useSyncExternalStore subscribers
    // re-render.
    this._snapshot = { tree: new FileTreeModel(handle), files: new Map() };
    this.notify();
  }

  /**
   * Loads the file at the given path from the workspace.
   *
   * @param path The path of the file to load.
   * @param reload Whether to reload the file even if it is already cached.
   * @returns The loaded file, or undefined if the file could not be loaded.
   */
  public async loadFile(
    path: string,
    reload: boolean = false,
  ): Promise<File | undefined> {
    // If the workspace tree is not available, the file cannot be loaded.
    if (!this._snapshot.tree) {
      return undefined;
    }

    // Check if the file is already cached and reload is not requested.
    let fileHandle = this._snapshot.files.get(path);
    if (!reload && fileHandle) {
      return await fileHandle.getFile();
    }

    // Attempt to find the file in the workspace tree.
    fileHandle = this._snapshot.tree.findFile(path);
    if (!fileHandle) {
      return undefined;
    }

    // Cache the file handle and attempt to load the file.
    try {
      this._snapshot.files.set(path, fileHandle);
      return await fileHandle.getFile();
    } catch {
      return undefined;
    }
  }

  /**
   * Unloads the file at the given path from the workspace, removing it from
   * the cache.
   *
   * @param path The path of the file to unload.
   */
  public async unloadFile(path: string): Promise<void> {
    this._snapshot.files.delete(path);
  }
}

export type IWorkspaceService = WorkspaceService;
export const IWorkspaceService =
  createDecorator<IWorkspaceService>('workspace');
