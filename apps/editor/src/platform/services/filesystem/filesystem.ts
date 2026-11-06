import { toArrayBuffer } from '../../../util/array';
import { ILoggerService } from '../logger';
import { Service, createDecorator } from '../service';
import type { LoadDirectory, LoadFile, SaveFile } from './types';

export class FileSystemService extends Service {
  constructor(@ILoggerService private loggerService: ILoggerService) {
    super();
  }

  public readonly reset = (): void => undefined;

  public async write(
    bytes: Uint8Array,
    suggestedName: string,
    types: FilePickerAcceptType[],
    mimeType: string,
    existingHandle: FileSystemFileHandle | null = null,
  ): Promise<SaveFile> {
    let saved: SaveFile;

    // If there's an existing file handle, write back to it
    if (existingHandle) {
      const writable = await existingHandle.createWritable();
      await writable.write(toArrayBuffer(bytes));
      await writable.close();
      saved = { name: existingHandle.name, handle: existingHandle };
    }
    // Otherwise check if we're in a browser environment where we can open
    // the save file picker.
    else if (this.isAccessible()) {
      const handle = await window.showSaveFilePicker!({
        types,
        suggestedName,
      });
      const writable = await handle.createWritable();
      await writable.write(toArrayBuffer(bytes));
      await writable.close();
      saved = { name: handle.name, handle };
    }
    // Otherwise attempt a download of the file directly.
    else {
      this.#download(bytes, suggestedName, mimeType);
      saved = { name: suggestedName, handle: null };
    }

    this.loggerService.info(`File saved to: ${saved.name}`);
    return saved;
  }

  public async read(
    types: FilePickerAcceptType[] = [],
    relativeTo?: FileSystemDirectoryHandle,
    relativePath?: string,
  ): Promise<LoadFile | null> {
    if (this.isAccessible()) {
      const [handle] = await window.showOpenFilePicker!({ types });
      const file = await handle.getFile();
      const baseDirectory = relativeTo
        ? await this.resolveDirectory(relativeTo, relativePath)
        : null;
      const resolvedPath = baseDirectory
        ? await baseDirectory.resolve(handle)
        : undefined;
      if (baseDirectory && !resolvedPath) {
        throw new Error(
          relativePath
            ? 'Choose a file inside the audio root folder.'
            : 'Choose a file inside the project folder.',
        );
      }
      const opened: LoadFile = {
        name: file.name,
        ...(resolvedPath ? { relativePath: resolvedPath.join('/') } : {}),
        bytes: new Uint8Array(await file.arrayBuffer()),
        handle,
      };
      this.loggerService.info(`File loaded: ${opened.name}`);
      return opened;
    }

    const opened = await new Promise<LoadFile | null>((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = types
        .flatMap((type) => Object.values(type.accept!).flat())
        .join(',');
      input.onchange = () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) {
          resolve(null);
          return;
        }
        if (relativeTo) {
          reject(
            new Error(
              'This browser cannot resolve a file path relative to the project folder.',
            ),
          );
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
    if (opened) {
      this.loggerService.info(`File loaded: ${opened.name}`);
    }
    return opened;
  }

  public async readDirectory(
    relativeTo?: FileSystemDirectoryHandle,
  ): Promise<LoadDirectory> {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    if (!relativeTo) {
      return {
        name: handle.name,
        handle,
      };
    }
    const relativePath = await relativeTo.resolve(handle);
    if (!relativePath) {
      throw new Error('Choose an audio root folder inside the project folder.');
    }
    return {
      name: handle.name,
      relativePath: relativePath.join('/'),
      handle,
    };
  }

  public isAccessible() {
    return (
      typeof window !== 'undefined' &&
      typeof window.showOpenFilePicker === 'function' &&
      typeof window.showSaveFilePicker === 'function' &&
      window.origin !== null &&
      !(window.navigator?.userAgent ?? '').includes('Electron')
    );
  }

  private async resolveDirectory(
    root: FileSystemDirectoryHandle,
    path?: string,
  ): Promise<FileSystemDirectoryHandle> {
    let directory = root;
    for (const part of (path ?? '').split(/[\\/]/).filter(Boolean)) {
      directory = await directory.getDirectoryHandle(part);
    }
    return directory;
  }

  #download(bytes: Uint8Array, name: string, mimeType: string): void {
    const url = URL.createObjectURL(
      new Blob([toArrayBuffer(bytes)], { type: mimeType }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

export type IFileSystemService = FileSystemService;
export const IFileSystemService =
  createDecorator<IFileSystemService>('filesystem');
