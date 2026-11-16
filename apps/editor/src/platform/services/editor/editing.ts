import type { Midi } from '@openchart/midi';
import {
  ClipboardService,
  Document,
  type EditResult,
  EditingModeId,
  EditingModeRegistry,
  type EditingSession,
  type EditingTarget,
  type ModeRegistry,
  SelectionModel,
  SongView,
  type TrackDescriptor,
  createEditingSession,
  createRulesetContext,
  createUnmappedTrackRules,
} from '@openchart/views';
import { defaultModes } from '@openchart/views';

import { IPlaybackService } from '../playback/playback';
import { IProjectService } from '../project/project';
import { IRulesetService } from '../ruleset';
import { Service, createDecorator } from '../service';
import { IViewportService, type ViewportSession } from './viewports';

type ResultListener = (result: EditResult) => void;

/** Bridges editing modes and sessions to editor history and playback. */
export class EditingService extends Service {
  public readonly selection = new SelectionModel();
  private clipboardInstance!: ClipboardService;
  private registryInstance!: ModeRegistry;

  private readonly resultListeners = new Set<ResultListener>();
  private readonly sessions = new Map<string, EditingSession>();
  private readonly sessionSignatures = new Map<string, string>();
  private document: Document | null = null;
  private syncedMidi: Midi | undefined;
  private projectId!: number;
  private lastResultValue: EditResult = emptyResult();

  public constructor(
    @IProjectService private readonly projectService: IProjectService,
    @IPlaybackService private readonly playbackService: IPlaybackService,
    @IViewportService private readonly viewportService: IViewportService,
    @IRulesetService private readonly rulesetService: IRulesetService,
  ) {
    super();
  }

  public init(): void {
    this.registryInstance = new EditingModeRegistry();
    defaultModes.forEach((mode) => this.registryInstance.register(mode));
    this.viewportService.setModeRegistry(this.registryInstance);
    this.viewportService.setTrackResolver(
      (viewport) => this.resolveTrack(viewport).descriptor,
    );
    this.syncedMidi = this.projectService.data;
    this.projectId = this.projectService.projectId;
    const document = this.createDocument(this.projectService.data);
    this.document = document;
    this.clipboardInstance = new ClipboardService();
    this.projectService.subscribe(this.syncDocument);
    this.viewportService.subscribe(this.syncViewports);
    this.rulesetService.subscribe(this.syncRuleset);
  }

  public get clipboard(): ClipboardService {
    return this.clipboardInstance;
  }

  public get registry(): ModeRegistry {
    return this.registryInstance;
  }

  /** Last result emitted to EditingService subscribers. */
  public get lastResult(): EditResult {
    return this.lastResultValue;
  }

  /** Subscribes to successful editing results. */
  public subscribeResult(listener: ResultListener): () => void {
    this.resultListeners.add(listener);
    return () => this.resultListeners.delete(listener);
  }

  public readonly reset = (): void => {
    this.selection.clear();
    this.clipboard.clear();
    this.sessions.clear();
    this.sessionSignatures.clear();
    this.syncDocument();
    this.notify();
  };

  /** @deprecated Use the active EditingSession. */
  public getDocument(): Document {
    if (!this.document) {
      throw new Error('There is no MIDI document to edit.');
    }
    return this.document;
  }

  /** Returns the cached session for the specified viewport, if supported. */
  public getSession(
    viewportId: string,
    requestedModeId?: EditingModeId | 'global',
  ): EditingSession | null {
    const viewport = this.viewportService.getViewport(viewportId);
    if (!viewport || !this.document || !this.projectService.data) return null;
    const modeId =
      requestedModeId === 'global' ? EditingModeId.MidiGlobal : requestedModeId;
    const cacheKey = modeId ? `${viewportId}::${modeId}` : viewportId;
    const signature = this.sessionSignature(viewport, modeId);
    if (this.sessionSignatures.get(cacheKey) === signature) {
      const session = this.sessions.get(cacheKey) ?? null;
      if (session) this.syncToolState(viewport, session);
      return session;
    }

    this.sessions.delete(cacheKey);
    this.sessionSignatures.delete(cacheKey);
    const session = this.createSession(viewport, modeId);
    if (!session) return null;
    this.sessions.set(cacheKey, session);
    this.sessionSignatures.set(cacheKey, signature);
    this.syncToolState(viewport, session);
    return session;
  }

  /** Applies a partial tool-state update after validating the mode schema. */
  public updateToolState(
    viewportId: string,
    modeId: EditingModeId,
    update: Record<string, unknown>,
  ): void {
    const viewport = this.viewportService.getViewport(viewportId);
    const mode = this.registry.getById(modeId);
    if (!viewport || !mode) {
      throw new Error(`Unknown viewport or editing mode '${modeId}'`);
    }
    const current = viewport.tools[modeId] ?? mode.createDefaultToolState();
    if (!isRecord(current)) {
      throw new Error(`Tool state for mode '${modeId}' must be an object`);
    }
    const next = mode.toolStateSchema.parse({ ...current, ...update });
    this.viewportService.setModeToolState(viewportId, modeId, next);
    const primaryMode = this.registry.resolve(
      this.resolveTrack(viewport).descriptor,
      viewport.view,
    );
    const cacheKey =
      primaryMode?.id === modeId ? viewportId : `${viewportId}::${modeId}`;
    this.sessions.get(cacheKey)?.setToolState(next);
    this.notify();
  }

  /** Reports whether the selected track can be hosted by the requested view. */
  public canHost(viewportId: string, hostKind: string): boolean {
    const viewport = this.viewportService.getViewport(viewportId);
    if (!viewport || !this.projectService.data) return false;
    return this.registry.canHost(
      this.resolveTrack(viewport).descriptor,
      hostKind,
    );
  }

  /** Returns the active viewport's session, if its view is supported. */
  public getActiveSession(): EditingSession | null {
    const viewport = this.viewportService.getActiveViewport();
    return viewport ? this.getSession(viewport.id) : null;
  }

  private readonly syncDocument = (): void => {
    const snapshot = this.projectService.getSnapshot();
    const midi = snapshot.data;
    if (midi === this.syncedMidi && snapshot.projectId === this.projectId) {
      return;
    }

    const projectChanged = snapshot.projectId !== this.projectId;
    this.syncedMidi = midi;
    this.projectId = snapshot.projectId;
    this.document = midi ? this.createDocument(midi) : null;
    this.sessions.clear();
    this.sessionSignatures.clear();
    if (projectChanged) {
      this.selection.clear();
      this.clipboard.clear();
    }
    this.notify();
  };

  /** A new ruleset invalidates the document's track rules and every session. */
  private readonly syncRuleset = (): void => {
    const midi = this.projectService.data;
    this.document = midi ? this.createDocument(midi) : null;
    this.sessions.clear();
    this.sessionSignatures.clear();
    this.notify();
  };

  private readonly syncViewports = (): void => {
    const activeIds = new Set(
      this.viewportService
        .getSnapshot()
        .viewportSessions.map((viewport) => viewport.id),
    );
    for (const cacheKey of this.sessions.keys()) {
      const separator = cacheKey.indexOf('::');
      const viewportId =
        separator < 0 ? cacheKey : cacheKey.slice(0, separator);
      const modeId =
        separator < 0
          ? undefined
          : (cacheKey.slice(separator + 2) as EditingModeId);
      const viewport = this.viewportService.getViewport(viewportId);
      if (
        !activeIds.has(viewportId) ||
        !viewport ||
        this.sessionSignatures.get(cacheKey) !==
          this.sessionSignature(viewport, modeId)
      ) {
        this.sessions.delete(cacheKey);
        this.sessionSignatures.delete(cacheKey);
      }
    }
    this.notify();
  };

  private createSession(
    viewport: ViewportSession,
    modeId?: EditingModeId,
  ): EditingSession | null {
    if (!this.projectService.data || !this.document) return null;
    const viewportTarget = this.resolveTrack(viewport);
    const mode = modeId
      ? this.registry.getById(modeId)
      : this.registry.resolve(viewportTarget.descriptor, viewport.view);
    if (!mode) return null;

    const targetTrack =
      mode.id === EditingModeId.MidiGlobal
        ? this.resolveGlobalTrack()
        : viewportTarget;
    if (!targetTrack) return null;
    const { descriptor, trackIndex } = targetTrack;
    const target: EditingTarget = {
      trackKey: descriptor.key,
      trackIndex,
      difficulty:
        mode.id === EditingModeId.MidiGlobal ? null : viewport.difficulty,
    };
    return createEditingSession({
      document: this.document,
      mode,
      target,
      hostKind: mode.hostKinds.values().next().value ?? viewport.view,
      rules: this.rulesetService.compiled,
      rulesContext: () => this.createRulesContext(),
      transaction: {
        begin: this.projectService.beginEdit,
        record: this.projectService.recordEdit,
        end: this.projectService.endEdit,
        rollback: this.projectService.rollbackEdit,
      },
      selection: this.selection,
      clipboard: this.clipboard,
      onCommit: (result) => this.publishResult(result),
    });
  }

  private resolveGlobalTrack(): {
    descriptor: TrackDescriptor;
    trackIndex: number | null;
  } | null {
    const descriptor = this.rulesetService.compiled
      .descriptors()
      .find((track) => track.kind === 'global');
    if (!descriptor) return null;
    const index = this.projectService.data!.tracks.findIndex(
      (track) => track.name === descriptor.name,
    );
    return { descriptor, trackIndex: index >= 0 ? index : null };
  }

  private syncToolState(
    viewport: ViewportSession,
    session: EditingSession,
  ): void {
    const state =
      viewport.tools[session.mode.id] ?? session.mode.createDefaultToolState();
    session.setToolState(state);
  }

  private resolveTrack(viewport: ViewportSession): {
    descriptor: TrackDescriptor;
    trackIndex: number | null;
  } {
    const midi = this.projectService.data;
    if (!midi) throw new Error('There is no MIDI document to resolve.');
    const song = new SongView(midi, this.rulesetService.compiled);
    const descriptors = song.getTrackDescriptors();
    if (viewport.trackKey.startsWith('unmapped-')) {
      const index = Number(viewport.trackKey.slice('unmapped-'.length));
      const track = Number.isSafeInteger(index)
        ? song.getUnmappedMidiTracks()[index]
        : undefined;
      return {
        descriptor: this.createUnmappedDescriptor(
          viewport.trackKey,
          track?.name ?? viewport.instrument,
        ),
        trackIndex: track
          ? this.projectService.data!.tracks.indexOf(track)
          : null,
      };
    }
    const descriptor =
      descriptors.find(
        (item) =>
          item.key === viewport.trackKey || item.name === viewport.instrument,
      ) ??
      this.createUnmappedDescriptor(viewport.trackKey, viewport.instrument);
    const index = this.projectService.data!.tracks.findIndex(
      (track) => track.name === descriptor.name,
    );
    return { descriptor, trackIndex: index >= 0 ? index : null };
  }

  /** A MIDI track the ruleset does not describe: editable but unconstrained. */
  private createUnmappedDescriptor(key: string, name: string): TrackDescriptor {
    const rules = createUnmappedTrackRules(name, key);
    return {
      key,
      name,
      kind: rules.kind,
      visible: true,
      editable: true,
      rules,
    };
  }

  /** Rule-evaluation inputs: ppqn, project settings and player options. */
  private createRulesContext() {
    const midi = this.projectService.data;
    const settings = this.projectService.getSnapshot().metadata.settings;
    const settingsSources = this.rulesetService.compiled.settingsSources;
    return createRulesetContext({
      ppqn: midi?.header.division ?? 480,
      settings: (source, key) => {
        const sourceDefinition = settingsSources.find(
          (item) => item.id === source,
        );
        const value =
          sourceDefinition?.file === 'info.json' ? settings[key] : undefined;
        return typeof value === 'boolean' ||
          typeof value === 'number' ||
          typeof value === 'string'
          ? value
          : undefined;
      },
    });
  }

  private sessionSignature(
    viewport: ViewportSession,
    modeId?: EditingModeId,
  ): string {
    const { trackIndex } = this.resolveTrack(viewport);
    return [
      this.projectService.projectId,
      this.rulesetService.getSnapshot().revision,
      modeId ?? 'primary',
      viewport.trackKey,
      trackIndex,
      viewport.difficulty,
      modeId ? 'global' : viewport.view,
    ].join(':');
  }

  private createDocument(midi: Midi): Document {
    return new Document(midi, this.rulesetService.compiled);
  }

  private publishResult(result: EditResult): void {
    this.lastResultValue = result;
    this.playbackService.refresh(this.projectService.data);
    for (const listener of [...this.resultListeners]) listener(result);
    this.notify();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function emptyResult(): EditResult {
  return {
    changed: false,
    createdIds: [],
    updatedIds: [],
    removedIds: [],
    rejections: [],
    diagnostics: [],
  };
}

export type IEditingService = EditingService;
export const IEditingService =
  createDecorator<IEditingService>('editor.editing');

/** @deprecated Use EditingService. */
export type EditorEditingService = EditingService;
