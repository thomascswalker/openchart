import { Midi } from "@openchart/core";
import { DEFAULT_HISTORY_CAPACITY, History } from "../context/History";
import type { FileSystemService } from "./filesystem";
import type { LoggerService } from "./logger";
import { IStatefulService } from "../platform/services";
import {
  makeDefaultMetadata,
  metadataSchema,
  type Metadata,
} from "./document/schema";

function hasMidiExtension(fileName: string): boolean {
  return /\.(mid|midi)$/i.test(fileName);
}

export interface DocumentSnapshot {
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

export class DocumentService extends IStatefulService<DocumentSnapshot> {
  static dependencies = ["logger", "filesystem"];

  #logger: LoggerService;
  #fileSystem: FileSystemService;
  #data: Midi | null = new Midi();
  #name: string | null = null;
  #handle: FileSystemFileHandle | null = null;
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
    const opened = await this.#fileSystem.readMidi();
    if (!opened) {
      return false;
    }

    if (!hasMidiExtension(opened.name)) {
      throw new Error("Choose a MIDI file (.mid or .midi).");
    }

    const metadata = opened.metadataBytes
      ? metadataSchema.parse(
          JSON.parse(new TextDecoder().decode(opened.metadataBytes)),
        )
      : makeDefaultMetadata();
    this.update(
      new Midi(opened.bytes),
      opened.name,
      opened.handle,
      opened.directoryHandle ?? null,
      metadata,
    );
    this.#logger.info(`Document opened: ${opened.name}`);
    return true;
  }

  public export(): MidiExport {
    if (!this.#data) {
      throw new Error("There is no MIDI document to export.");
    }
    const baseName = (
      this.#name ??
      this.#metadata.song.name ??
      "untitled"
    ).replace(/\.(mid|midi)$/i, "");
    return {
      bytes: this.#data.toBuffer(),
      suggestedName: `${baseName || "untitled"}.mid`,
    };
  }

  public readonly bindFile = (
    fileName: string | null,
    fileHandle: FileSystemFileHandle | null,
    directoryHandle: FileSystemDirectoryHandle | null = null,
  ): void => {
    this.#name = fileName;
    this.#handle = fileHandle;
    this.#directoryHandle = directoryHandle;
    this.publish();
  };

  public readonly beginOpenChart = (): void => {
    this.#history.beginTransaction();
    this.publish();
  };

  public readonly recordOpenChart = (): void => {
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

  public readonly endOpenChart = (): void => {
    if (!this.#data) {
      return;
    }
    if (this.#history.endTransaction(this.#data)) {
      this.#isDirty = true;
    }
    this.publish();
  };

  public readonly rollbackOpenChart = (): boolean => {
    const restored = this.#history.rollbackTransaction();
    if (!restored) {
      return false;
    }
    this.#data = restored;
    this.publish();
    return true;
  };

  public readonly undoOpenChart = (): void => {
    const restored = this.#history.undo();
    if (!restored) {
      return;
    }
    this.#data = restored;
    this.#isDirty = true;
    this.publish();
  };

  public readonly redoOpenChart = (): void => {
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
    this.#name = name;
    this.#handle = handle;
    this.#directoryHandle = directoryHandle;
    this.#metadata = metadata;
    this.#isDirty = false;
    this.#history.reset(midi);
    this.publish();
  }

  private publish(): void {
    this._snapshot = {
      midi: this.#data,
      file: this.#name,
      handle: this.#handle,
      directoryHandle: this.#directoryHandle,
      isDirty: this.#isDirty,
      canUndo: this.#history.canUndo,
      canRedo: this.#history.canRedo,
      metadata: this.#metadata,
    };
    this.notify();
  }
}
