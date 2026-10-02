import { Midi } from "@midiedit/core";
import type { FileSystemService } from "./filesystem";
import type { ILoggerService } from "./logger";
import type { PublicMethods } from "../util/meta";

export class DocumentService {
  static dependencies = ["global.logger", "global.filesystem"];

  private _logger: ILoggerService;
  private _fileSystem: FileSystemService;
  private _isDirty: boolean;
  private _data: Midi;

  constructor(logger: ILoggerService, fileSystem: FileSystemService) {
    this._logger = logger;
    this._isDirty = false;
    this._data = new Midi();
    this._fileSystem = fileSystem;
  }

  public new(): void {
    this._data = new Midi();
    this._data.addTrack();
    this._isDirty = false;
    this._logger.debug(`New document created and marked as clean.`);
  }

  public async save(): Promise<boolean> {
    const success = await this._fileSystem.save(this._data.toBuffer());
    if (success) {
      this._isDirty = false;
    }
    return success;
  }

  public async saveAs(filename: string): Promise<boolean> {
    this._fileSystem.setPath(filename);
    return this.save();
  }

  public async load(): Promise<boolean> {
    const data = await this._fileSystem.load();
    if (data) {
      this._data = new Midi(data);
      this._isDirty = false;
      return true;
    }
    return false;
  }

  public setDirty() {
    this._isDirty = true;
    this._logger.debug(`Document marked as dirty.`);
  }
  public setClean() {
    this._isDirty = false;
    this._logger.debug(`Document marked as clean.`);
  }
  public isDirty() {
    return this._isDirty;
  }

  public getData() {
    return this._data;
  }
  public setData(data: Midi) {
    this._data = data;
    this._isDirty = true;
    this._logger.debug(`Document data updated and marked as dirty.`);
  }
}

export type IDocumentService = PublicMethods<DocumentService>;
