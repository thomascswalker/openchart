import { Midi } from "@openchart/core";
import { DEFAULT_HISTORY_CAPACITY, History } from "../context/History";
import type { FileSystemService } from "./filesystem";
import type { SaveFile } from "./filesystem/types";
import type { LoggerService } from "./logger";
import { StatefulService } from "../platform/services";
import {
  makeDefaultMetadata,
  metadataSchema,
  type Metadata,
} from "./document/schema";
import { toArrayBuffer } from "../util/array";

export interface DocumentSnapshot {
  documentId: number;
  midi: Midi | null;
  file: string | null;
  handle: FileSystemFileHandle | null;
  directoryHandle: FileSystemDirectoryHandle | null;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  metadata: Metadata;
}

export interface MidiExport {
  bytes: Uint8Array;
  suggestedName: string;
}

export interface DocumentFile {
  name: string;
  bytes: Uint8Array;
  mimeType: string;
}

export class DocumentService extends StatefulService<DocumentSnapshot> {
  static dependencies = ["logger", "filesystem"];

  #logger: LoggerService;
  #fileSystem: FileSystemService;
  #data: Midi | null = new Midi();
  #documentId = 0;
  #fileName: string | null = null;
  #fileHandle: FileSystemFileHandle | null = null;
  #directoryHandle: FileSystemDirectoryHandle | null = null;
  #isDirty = false;
  #metadata: Metadata = makeDefaultMetadata();
  readonly #history = new History(DEFAULT_HISTORY_CAPACITY);

  constructor(logger: LoggerService, fileSystem: FileSystemService) {
    super();
    this.#logger = logger;
    this.#fileSystem = fileSystem;
    this.#history.reset(this.#data!);
    this.publish();
  }

  public get data(): Midi {
    return this.#data!;
  }

  public set data(data: Midi) {
    this.#data = data;
    this.#documentId += 1;
    this.#history.reset(this.#data);
    this.#isDirty = true;
    this.publish();
  }

  public get metadata(): Metadata {
    return this.#metadata;
  }

  public set metadata(metadata: Metadata) {
    this.#metadata = metadataSchema.parse(metadata);
    this.#isDirty = true;
    this.publish();
  }

  public get isDirty() {
    return this.#isDirty;
  }

  public set isDirty(state: boolean) {
    if (this.#isDirty === state) {
      return;
    }
    this.#isDirty = state;
    this.publish();
  }

  public readonly reset = (): void => {
    this.update(new Midi(), null, null, null, makeDefaultMetadata());
  };

  public async open(): Promise<boolean> {
    const opened = await this.#fileSystem.readProject();
    if (!opened) {
      return false;
    }

    const metadata = metadataSchema.parse(
      JSON.parse(new TextDecoder().decode(opened.metadataBytes)),
    );

    this.update(
      new Midi(opened.midiBytes),
      "notes.mid",
      opened.midiHandle,
      opened.directoryHandle,
      metadata,
    );
    this.#logger.info("Project opened from metadata JSON.");
    return true;
  }

  public async save(): Promise<boolean> {
    return this.saveToDirectory(this.#directoryHandle);
  }

  public async saveAs(): Promise<boolean> {
    return this.saveToDirectory(null);
  }

  public async writeFiles(
    files: DocumentFile[],
    directoryHandle: FileSystemDirectoryHandle | null = null,
  ): Promise<SaveFile> {
    const [primaryFile] = files;
    if (!primaryFile) {
      throw new Error("At least one file is required.");
    }

    let targetDirectory = directoryHandle;
    if (!targetDirectory && typeof window.showDirectoryPicker === "function") {
      targetDirectory = await window.showDirectoryPicker({
        mode: "readwrite",
      });
    }

    if (!targetDirectory) {
      for (const file of files) {
        const url = URL.createObjectURL(
          new Blob([toArrayBuffer(file.bytes)], { type: file.mimeType }),
        );
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      const saved: SaveFile = {
        name: primaryFile.name,
        handle: null,
        directoryHandle: null,
      };
      this.#logger.info(
        `Files saved: ${files.map((file) => file.name).join(", ")}`,
      );
      return saved;
    }

    const handles: FileSystemFileHandle[] = [];
    for (const file of files) {
      const handle = await targetDirectory.getFileHandle(file.name, {
        create: true,
      });
      const writable = await handle.createWritable();
      await writable.write(toArrayBuffer(file.bytes));
      await writable.close();
      handles.push(handle);
    }
    const saved: SaveFile = {
      name: handles[0]!.name,
      handle: handles[0]!,
      directoryHandle: targetDirectory,
    };
    this.#logger.info(
      `Files saved: ${files.map((file) => file.name).join(", ")}`,
    );
    return saved;
  }

  private async saveToDirectory(
    directoryHandle: FileSystemDirectoryHandle | null,
  ): Promise<boolean> {
    if (!this.#data?.trackCount) {
      throw new Error("There is no MIDI document to save.");
    }

    const { bytes } = this.export();
    const saved = await this.writeFiles(
      [
        {
          name: "notes.mid",
          bytes,
          mimeType: "audio/midi",
        },
        {
          name: "info.json",
          bytes: new TextEncoder().encode(
            JSON.stringify(this.#metadata, null, 2),
          ),
          mimeType: "application/json",
        },
      ],
      directoryHandle,
    );
    this.rebind(saved.name, saved.handle, saved.directoryHandle ?? null);
    this.isDirty = false;
    return true;
  }

  public export(): MidiExport {
    if (!this.#data) {
      throw new Error("There is no MIDI document to export.");
    }
    const baseName = (
      this.#fileName ??
      this.#metadata.song.name ??
      "untitled"
    ).replace(/\.(mid|midi)$/i, "");
    return {
      bytes: this.#data.toBuffer(),
      suggestedName: `${baseName || "untitled"}.mid`,
    };
  }

  public readonly rebind = (
    fileName: string | null,
    fileHandle: FileSystemFileHandle | null,
    directoryHandle: FileSystemDirectoryHandle | null = null,
  ): void => {
    this.#fileName = fileName;
    this.#fileHandle = fileHandle;
    this.#directoryHandle = directoryHandle;
    this.publish();
  };

  public readonly beginEdit = (): void => {
    this.#history.beginTransaction();
    this.publish();
  };

  public readonly recordEdit = (): void => {
    if (!this.#data) {
      return;
    }
    const wasInTransaction = this.#history.isInTransaction;
    this.#history.recordEdit(this.#data);
    this.#isDirty = true;
    if (!wasInTransaction) {
      this.publish();
    }
  };

  public readonly endEdit = (): void => {
    if (!this.#data) {
      return;
    }
    if (this.#history.endTransaction(this.#data)) {
      this.#isDirty = true;
    }
    this.publish();
  };

  public readonly rollbackEdit = (): boolean => {
    const restored = this.#history.rollbackTransaction();
    if (!restored) {
      return false;
    }
    this.#data = restored;
    this.publish();
    return true;
  };

  public readonly undoEdit = (): void => {
    const restored = this.#history.undo();
    if (!restored) {
      return;
    }
    this.#data = restored;
    this.#isDirty = true;
    this.publish();
  };

  public readonly redoEdit = (): void => {
    const restored = this.#history.redo();
    if (!restored) {
      return;
    }
    this.#data = restored;
    this.#isDirty = true;
    this.publish();
  };

  public readonly setHistoryCapacity = (capacity: number): void => {
    this.#history.setCapacity(capacity);
    this.publish();
  };

  private update(
    midi: Midi,
    name: string | null,
    handle: FileSystemFileHandle | null,
    directoryHandle: FileSystemDirectoryHandle | null,
    metadata: Metadata,
  ): void {
    this.#data = midi;
    this.#documentId += 1;
    this.#fileName = name;
    this.#fileHandle = handle;
    this.#directoryHandle = directoryHandle;
    this.#metadata = metadata;
    this.#isDirty = false;
    this.#history.reset(midi);
    this.publish();
  }

  private publish(): void {
    this._snapshot = {
      documentId: this.#documentId,
      midi: this.#data,
      file: this.#fileName,
      handle: this.#fileHandle,
      directoryHandle: this.#directoryHandle,
      isDirty: this.#isDirty,
      canUndo: this.#history.canUndo,
      canRedo: this.#history.canRedo,
      metadata: this.#metadata,
    };
    this.notify();
  }
}
