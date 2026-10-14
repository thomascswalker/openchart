import { Midi } from "@openchart/core";
import { midiFilePickerTypes } from "./types";
import { DEFAULT_HISTORY_CAPACITY, History } from "../../context/History";
import type { FileSystemService } from "../filesystem";
import type { LoggerService } from "../logger";
import { IStatefulService } from "../../platform/services";
import { makeDefaultMetadata, type Metadata } from "./schema";

export interface DocumentSnapshot {
  midi: Midi | null;
  file: string | null;
  handle: FileSystemFileHandle | null;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  metadata: Metadata;
}

const openFilePickerTypes = [...midiFilePickerTypes];

function hasMidiExtension(fileName: string): boolean {
  return /\.(mid|midi)$/i.test(fileName);
}

export class DocumentService extends IStatefulService<DocumentSnapshot> {
  static dependencies = ["logger", "filesystem"];

  #logger: LoggerService;
  #fileSystem: FileSystemService;
  #data: Midi | null = new Midi();
  #name: string | null = null;
  #handle: FileSystemFileHandle | null = null;
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

  public readonly reset = (): void => {
    this.update(new Midi(), null, null);
  };

  public async open(): Promise<boolean> {
    const opened = await this.#fileSystem.read(openFilePickerTypes);
    if (!opened) {
      return false;
    }

    if (!hasMidiExtension(opened.name)) {
      throw new Error("Choose a MIDI file (.mid or .midi).");
    }

    this.update(new Midi(opened.bytes), opened.name, opened.handle);
    this.#logger.info(`Document opened: ${opened.name}`);
    return true;
  }

  public get data(): Midi {
    return this.#data!;
  }

  public set data(newData: Midi) {
    this.#data = newData;
  }

  public readonly setMidiData = (data: Midi): void => {
    this.#data = data;
    this.#history.reset(data);
    this.#isDirty = true;
    this.publish();
  };

  public readonly setFileBinding = (
    fileName: string | null,
    fileHandle: FileSystemFileHandle | null,
  ): void => {
    this.#name = fileName;
    this.#handle = fileHandle;
    this.publish();
  };

  public readonly setDirty = (isDirty = true): void => {
    if (this.#isDirty === isDirty) {
      return;
    }
    this.#isDirty = isDirty;
    this.publish();
  };

  public readonly setClean = (): void => this.setDirty(false);

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

  /** Discards the open edit transaction, restoring the pre-edit document. */
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

  public isDirty(): boolean {
    return this.#isDirty;
  }

  public getData(): Midi | null {
    return this.#data;
  }

  private update(
    midi: Midi,
    name: string | null,
    handle: FileSystemFileHandle | null,
  ): void {
    this.#data = midi;
    this.#name = name;
    this.#handle = handle;
    this.#isDirty = false;
    this.#history.reset(midi);
    this.publish();
  }

  private publish(): void {
    this._snapshot = {
      midi: this.#data,
      file: this.#name,
      handle: this.#handle,
      isDirty: this.#isDirty,
      canUndo: this.#history.canUndo,
      canRedo: this.#history.canRedo,
      metadata: this.#metadata,
    };
    this.notify();
  }
}
