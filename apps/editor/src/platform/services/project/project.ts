import { Midi } from '@openchart/midi';

import { DEFAULT_HISTORY_CAPACITY, History } from '../../../context/History';
import { toArrayBuffer } from '../../../util/array';
import type { SaveFile } from '../filesystem/types';
import { ILoggerService } from '../logger';
import { IRulesetService } from '../ruleset';
import { createDecorator } from '../service';
import { StatefulService } from '../statefulService';
import { IWorkspaceService } from '../workspace';
import { makeDefaultMidi } from './schema';
import {
  type Metadata,
  buildMetadataSchema,
  makeDefaultMetadata,
} from './schema';

const MidiFileName = 'notes.mid';

export interface ProjectSnapshot {
  projectId: number;
  data?: Midi;
  metadata: Metadata;
  projectFileHandle?: FileSystemFileHandle;
  midiFileHandle?: FileSystemFileHandle;
  directoryHandle?: FileSystemDirectoryHandle;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface MidiExport {
  bytes: Uint8Array;
  suggestedName: string;
}

export interface ProjectFile {
  name: string;
  bytes: Uint8Array;
  mimeType: string;
}

export interface OpenedProject {
  projectBytes: Uint8Array<ArrayBufferLike>;
  projectHandle: FileSystemFileHandle;
  midiBytes: Uint8Array<ArrayBuffer>;
  midiHandle: FileSystemFileHandle;
  directoryHandle: FileSystemDirectoryHandle;
}

export const DefaultOpenedProject: OpenedProject = {
  projectBytes: new Uint8Array(),
  projectHandle: {} as FileSystemFileHandle,
  midiBytes: new Uint8Array(),
  midiHandle: {} as FileSystemFileHandle,
  directoryHandle: {} as FileSystemDirectoryHandle,
};

export class ProjectService extends StatefulService<ProjectSnapshot> {
  static readonly id = 'project';

  #data: Midi | null = new Midi();
  #metadataSchema!: ReturnType<typeof buildMetadataSchema>;
  #projectId = 0;
  #projectFileHandle: FileSystemFileHandle | null = null;
  #midiFileHandle: FileSystemFileHandle | null = null;
  #directoryHandle: FileSystemDirectoryHandle | null = null;
  #isDirty = false;
  #metadata!: Metadata;
  readonly #history = new History(DEFAULT_HISTORY_CAPACITY);

  constructor(
    @ILoggerService private loggerService: ILoggerService,
    @IRulesetService private rulesetService: IRulesetService,
    @IWorkspaceService private workspaceService: IWorkspaceService,
  ) {
    super();
  }

  public init(): void {
    this.workspaceService.subscribe(() => this.reset());
    this.rulesetService.subscribe(this.syncRuleset);
    // Initialize metadata schema and default metadata based on the current ruleset.
    this.#metadataSchema = buildMetadataSchema(
      this.rulesetService.getSnapshot().ruleset,
    );
    this.#metadata = makeDefaultMetadata(
      this.rulesetService.getSnapshot().ruleset,
    );

    // Initialize the history with the current MIDI data.
    this.#history.reset(this.#data!);

    // Publish the initial state of the project.
    this.publish();
  }

  public get projectId(): number {
    return this.#projectId;
  }

  public get data(): Midi {
    return this.#data!;
  }

  public set data(data: Midi) {
    this.#data = data;
    this.#projectId += 1;
    this.#history.reset(this.#data);
    this.#isDirty = true;
    this.publish();
  }

  public get metadata(): Metadata {
    return this.#metadata;
  }

  public get metadataSchema(): ReturnType<typeof buildMetadataSchema> {
    return this.#metadataSchema;
  }

  public set metadata(metadata: Metadata) {
    this.#metadata = this.#metadataSchema.parse(metadata);
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

  /** Resets the project to its default state, including MIDI data and metadata. */
  public override reset(): void {
    this.data = makeDefaultMidi(this.rulesetService.compiled);
    this.metadata = makeDefaultMetadata(
      this.rulesetService.getSnapshot().ruleset,
    );
    this.isDirty = false;
  }

  /** Publishes the current state of the project to subscribers. */
  private publish(): void {
    this._snapshot = {
      projectId: this.#projectId,
      data: this.#data ?? undefined,
      metadata: this.#metadata,
      midiFileHandle: this.#midiFileHandle ?? undefined,
      projectFileHandle: this.#projectFileHandle ?? undefined,
      directoryHandle: this.#directoryHandle ?? undefined,
      isDirty: this.#isDirty,
      canUndo: this.#history.canUndo,
      canRedo: this.#history.canRedo,
    };
    this.notify();
  }

  /**
   * A new ruleset changes the difficulty and settings fields. Existing values
   * are kept where the new schema accepts them; otherwise defaults apply.
   */
  private readonly syncRuleset = (): void => {
    const { ruleset } = this.rulesetService.getSnapshot();
    this.#metadataSchema = buildMetadataSchema(ruleset);
    const migrated = this.#metadataSchema.safeParse(this.#metadata);
    this.#metadata = migrated.success
      ? (migrated.data as Metadata)
      : makeDefaultMetadata(ruleset);
    this.publish();
  };

  public async open(): Promise<boolean> {
    return await this.readProject()
      .then((project) => {
        if (!project) {
          this.loggerService.error('Failed to open project.');
          return false;
        }
        this.loggerService.info('Project directory opened...');
        const raw = JSON.parse(new TextDecoder().decode(project.projectBytes));
        const metadata = this.#metadataSchema.parse(raw);

        this.data = new Midi(project.midiBytes);
        this.metadata = metadata;
        this.#projectFileHandle = project.projectHandle;
        this.#midiFileHandle = project.midiHandle;
        this.#directoryHandle = project.directoryHandle;
        this.#isDirty = false;
        this.publish();
        this.loggerService.info('Project opened from metadata JSON.');
        return true;
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          this.loggerService.error(`Unable to open project: ${e}`);
        }
        return false;
      });
  }

  public async readProject(): Promise<OpenedProject | null> {
    const [projectHandle] = await window.showOpenFilePicker({
      multiple: false,
    });

    const projectFile = await projectHandle.getFile();

    const directoryHandle = this.workspaceService.getRootHandle();
    if (!directoryHandle) {
      throw new Error('Workspace root directory not found.');
    }
    const midiFileHandle: FileSystemFileHandle = await directoryHandle
      .getFileHandle(MidiFileName)
      .catch(() => {
        throw new Error(`${MidiFileName} not found.`);
      });
    const midiFile = await midiFileHandle.getFile();

    this.loggerService.info(`Project loaded: ${projectFile.name}`);

    return {
      projectBytes: new Uint8Array(await projectFile.arrayBuffer()),
      projectHandle: projectHandle as unknown as FileSystemFileHandle,
      midiBytes: new Uint8Array(await midiFile.arrayBuffer()),
      midiHandle: midiFileHandle,
      directoryHandle,
    };
  }

  public async save(): Promise<boolean> {
    return this.saveToDirectory(this.#directoryHandle);
  }

  public async saveAs(): Promise<boolean> {
    return this.saveToDirectory(null);
  }

  public async writeFiles(
    files: ProjectFile[],
    directoryHandle: FileSystemDirectoryHandle | null = null,
  ): Promise<SaveFile & { handles: FileSystemFileHandle[] }> {
    const [primaryFile] = files;
    if (!primaryFile) {
      throw new Error('At least one file is required.');
    }

    let targetDirectory = directoryHandle;
    if (!targetDirectory && typeof window.showDirectoryPicker === 'function') {
      targetDirectory = (await window.showDirectoryPicker({
        mode: 'readwrite',
      })) as unknown as FileSystemDirectoryHandle;
    }

    if (!targetDirectory) {
      for (const file of files) {
        const url = URL.createObjectURL(
          new Blob([toArrayBuffer(file.bytes)], { type: file.mimeType }),
        );
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      const saved: SaveFile & { handles: FileSystemFileHandle[] } = {
        name: primaryFile.name,
        handle: null,
        directoryHandle: null,
        handles: [],
      };
      this.loggerService.info(
        `Files saved: ${files.map((file) => file.name).join(', ')}`,
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
    const saved: SaveFile & { handles: FileSystemFileHandle[] } = {
      name: handles[0]!.name,
      handle: handles[0]!,
      directoryHandle: targetDirectory,
      handles,
    };
    this.loggerService.info(
      `Files saved: ${files.map((file) => file.name).join(', ')}`,
    );
    return saved;
  }

  private async saveToDirectory(
    directoryHandle: FileSystemDirectoryHandle | null,
  ): Promise<boolean> {
    if (!this.#data?.trackCount) {
      throw new Error('There is no MIDI project to save.');
    }

    const { bytes } = this.export();
    const saved = await this.writeFiles(
      [
        {
          name: 'notes.mid',
          bytes,
          mimeType: 'audio/midi',
        },
        {
          name: 'info.json',
          bytes: new TextEncoder().encode(
            JSON.stringify(this.#metadata, null, 2),
          ),
          mimeType: 'application/json',
        },
      ],
      directoryHandle,
    );
    this.#midiFileHandle = saved.handles[0] ?? null;
    this.#projectFileHandle = saved.handles[1] ?? null;
    this.#directoryHandle = saved.directoryHandle ?? null;
    this.#isDirty = false;
    this.publish();
    return true;
  }

  public export(): MidiExport {
    if (!this.#data) {
      throw new Error('There is no MIDI project to export.');
    }
    const fileName = this.#midiFileHandle?.name;
    const baseName = (
      fileName ??
      this.#metadata.song.name ??
      'untitled'
    ).replace(/\.(mid|midi)$/i, '');
    return {
      bytes: this.#data.toBuffer(),
      suggestedName: `${baseName || 'untitled'}.mid`,
    };
  }

  public readonly rebind = (
    fileHandle: FileSystemFileHandle | null,
    directoryHandle: FileSystemDirectoryHandle | null = null,
  ): void => {
    this.#projectFileHandle = fileHandle;
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
}

export type IProjectService = ProjectService;
export const IProjectService = createDecorator<IProjectService>('project');
