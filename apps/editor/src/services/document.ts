import { Midi } from "@openchart/core";
import {
  createProjectMetadata,
  type ProjectMetadata,
} from "../project/projectMetadata";
import {
  createProjectDocument,
  deserializeProject,
  type ProjectDocument,
} from "../project/projectService";
import {
  midiFilePickerTypes,
  projectFilePickerTypes,
} from "../project/fileTypes";
import { DEFAULT_HISTORY_CAPACITY, History } from "../context/History";
import type { FileSystemService } from "./filesystem";
import type { ILoggerService } from "./logger";
import { IStatefulService } from "../platform/services";

export interface DocumentSnapshot {
  midiData: Midi | null;
  projectDocument: ProjectDocument | null;
  projectMetadata: ProjectMetadata;
  fileName: string | null;
  fileHandle: FileSystemFileHandle | null;
  isDirty: boolean;
  canUndoMidi: boolean;
  canRedoMidi: boolean;
}

const openFilePickerTypes = [...midiFilePickerTypes, ...projectFilePickerTypes];

function hasMidiExtension(fileName: string): boolean {
  return /\.(mid|midi)$/i.test(fileName);
}

export class DocumentService extends IStatefulService<DocumentSnapshot> {
  static dependencies = ["logger", "filesystem"];

  private _logger: ILoggerService;
  private _fileSystem: FileSystemService;
  private readonly history = new History(DEFAULT_HISTORY_CAPACITY);
  private midiData: Midi | null = new Midi();
  private projectMetadata = createProjectMetadata();
  private fileName: string | null = null;
  private fileHandle: FileSystemFileHandle | null = null;
  private dirty = false;

  constructor(logger: ILoggerService, fileSystem: FileSystemService) {
    super();
    this._logger = logger;
    this._fileSystem = fileSystem;
    this.history.reset(this.midiData!);
    this._snapshot = this.buildSnapshot();
  }

  public readonly reset = (): void => {
    this.replaceDocument(
      new Midi(),
      createProjectMetadata(),
      null,
      null,
      false,
    );
  };

  public readonly new = (): void => {
    const data = new Midi();
    this.replaceDocument(data, createProjectMetadata(), null, null, false);
    this._logger.debug("New document created and marked as clean.");
  };

  public async open(): Promise<boolean> {
    const opened = await this._fileSystem.read(openFilePickerTypes);
    if (!opened) return false;

    let midiData: Midi;
    let projectMetadata: ProjectMetadata;
    if (/\.midproject$/i.test(opened.name)) {
      const project = await deserializeProject(opened.bytes, {
        fileName: opened.name,
        fileHandle: opened.handle,
      });
      midiData = project.midi;
      projectMetadata = project.metadata;
    } else {
      if (!hasMidiExtension(opened.name)) {
        throw new Error("Choose a MIDI file (.mid or .midi).");
      }
      midiData = new Midi(opened.bytes);
      projectMetadata = createProjectMetadata(
        opened.name.replace(/\.midi?$/i, ""),
      );
    }

    this.replaceDocument(
      midiData,
      projectMetadata,
      opened.name,
      opened.handle,
      false,
    );
    this._logger.info(`Document opened: ${opened.name}`);
    return true;
  }

  public readonly setMidiData = (data: Midi): void => {
    this.midiData = data;
    this.history.reset(data);
    this.dirty = true;
    this.publish();
  };

  public readonly setProjectMetadata = (metadata: ProjectMetadata): void => {
    this.projectMetadata = metadata;
    this.publish();
  };

  public readonly setFileBinding = (
    fileName: string | null,
    fileHandle: FileSystemFileHandle | null,
  ): void => {
    this.fileName = fileName;
    this.fileHandle = fileHandle;
    this.publish();
  };

  public readonly setDirty = (isDirty = true): void => {
    if (this.dirty === isDirty) return;
    this.dirty = isDirty;
    this.publish();
  };

  public readonly setClean = (): void => this.setDirty(false);

  public readonly beginOpenChart = (): void => {
    this.history.beginTransaction();
    this.publish();
  };

  public readonly recordOpenChart = (): void => {
    if (!this.midiData) return;
    const wasInTransaction = this.history.isInTransaction;
    this.history.recordEdit(this.midiData);
    this.dirty = true;
    if (!wasInTransaction) this.publish();
  };

  public readonly endOpenChart = (): void => {
    if (!this.midiData) return;
    if (this.history.endTransaction(this.midiData)) this.dirty = true;
    this.publish();
  };

  /** Discards the open edit transaction, restoring the pre-edit document. */
  public readonly rollbackOpenChart = (): boolean => {
    const restored = this.history.rollbackTransaction();
    if (!restored) return false;
    this.midiData = restored;
    this.publish();
    return true;
  };

  public readonly undoOpenChart = (): void => {
    const restored = this.history.undo();
    if (!restored) return;
    this.midiData = restored;
    this.dirty = true;
    this.publish();
  };

  public readonly redoOpenChart = (): void => {
    const restored = this.history.redo();
    if (!restored) return;
    this.midiData = restored;
    this.dirty = true;
    this.publish();
  };

  public readonly setHistoryCapacity = (capacity: number): void => {
    this.history.setCapacity(capacity);
    this.publish();
  };

  public isDirty(): boolean {
    return this.dirty;
  }

  public getData(): Midi | null {
    return this.midiData;
  }

  public setData(data: Midi): void {
    this.setMidiData(data);
  }

  private replaceDocument(
    midiData: Midi,
    projectMetadata: ProjectMetadata,
    fileName: string | null,
    fileHandle: FileSystemFileHandle | null,
    isDirty: boolean,
  ): void {
    this.midiData = midiData;
    this.projectMetadata = projectMetadata;
    this.fileName = fileName;
    this.fileHandle = fileHandle;
    this.dirty = isDirty;
    this.history.reset(midiData);
    this.publish();
  }

  private buildSnapshot(): DocumentSnapshot {
    return {
      midiData: this.midiData,
      projectDocument: this.midiData
        ? createProjectDocument(
            this.midiData,
            this.projectMetadata,
            { fileName: this.fileName, fileHandle: this.fileHandle },
            this.dirty,
          )
        : null,
      projectMetadata: this.projectMetadata,
      fileName: this.fileName,
      fileHandle: this.fileHandle,
      isDirty: this.dirty,
      canUndoMidi: this.history.canUndo,
      canRedoMidi: this.history.canRedo,
    };
  }

  private publish(): void {
    this._snapshot = this.buildSnapshot();
    this.notify();
  }
}
