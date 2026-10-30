import type { Midi } from "@openchart/midi";
import {
  CommandExecutor,
  ClipboardService,
  createRulesetContext,
  createUnmappedTrackRules,
  EditingModeId,
  EditingModeRegistry,
  SongView,
  EditingSession,
  SelectionModel,
  type EditResult,
  type ModeRegistry,
  type TrackDescriptor,
  type IEditingTarget,
} from "@openchart/views";
import { Service } from "../../platform/services";
import { DocumentService } from "../document";
import { PlaybackService } from "../playback";
import type { RulesetService } from "../ruleset";
import { ViewportService, type ViewportSession } from "./viewports";
import { defaultModes } from "@openchart/views";

type ResultListener = (result: EditResult) => void;

/** Bridges editing modes and sessions to editor history and playback. */
export class EditingService extends Service {
  public static dependencies = [
    "document",
    "playback",
    "editor.viewports",
    "ruleset",
  ];

  /** Shared payload used by every editing session. */
  public readonly clipboard: ClipboardService;

  public readonly registry: ModeRegistry;

  private readonly documentService: DocumentService;
  private readonly playbackService: PlaybackService;
  private readonly viewportService: ViewportService;
  private readonly rulesetService: RulesetService;
  private readonly resultListeners = new Set<ResultListener>();
  private readonly sessions = new Map<string, EditingSession>();
  private readonly sessionSignatures = new Map<string, string>();
  private commandExecutor: CommandExecutor | null = null;
  private midi: Midi | null = null;
  private documentId = -1;
  private lastResultValue: EditResult = emptyResult();

  public constructor(
    documentService: DocumentService,
    playbackService: PlaybackService,
    viewportService: ViewportService,
    rulesetService: RulesetService,
  ) {
    super();
    this.rulesetService = rulesetService;
    this.documentService = documentService;
    this.playbackService = playbackService;
    this.viewportService = viewportService;

    this.registry = new EditingModeRegistry();
    defaultModes.forEach((mode) => this.registry.register(mode));
    this.viewportService.setModeRegistry(this.registry);
    this.viewportService.setTrackResolver(
      (viewport) => this.resolveTrack(viewport).descriptor,
    );
    this.midi = documentService.data;
    this.documentId = documentService.getSnapshot().documentId;
    this.commandExecutor = this.createCommandExecutor(documentService.data);

    this.clipboard = new ClipboardService();
    this.documentService.subscribe(this.syncDocument);
    this.viewportService.subscribe(this.syncViewports);
    this.rulesetService.subscribe(this.syncRuleset);
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
    this.getActiveSelectionModel()?.clear();
    this.clipboard.clear();
    this.sessions.clear();
    this.sessionSignatures.clear();
    this.syncDocument();
    this.notify();
  };

  public getCommandExecutor(): CommandExecutor | null {
    return this.commandExecutor;
  }

  /** Returns the cached session for the specified viewport, if supported. */
  public getEditingSession(
    viewportId?: string,
    modeId?: EditingModeId,
  ): EditingSession | undefined {
    if (!viewportId) {
      return;
    }
    const viewport = this.viewportService.getViewport(viewportId);
    if (!viewport || !this.commandExecutor || !this.midi) {
      return;
    }
    const cacheKey = modeId ? `${viewportId}::${modeId}` : viewportId;
    const signature = this.sessionSignature(viewport, modeId);
    if (this.sessionSignatures.get(cacheKey) === signature) {
      const session = this.sessions.get(cacheKey);
      if (session) {
        this.syncToolState(viewport, session);
      }
      return session;
    }

    const session = this.createSession(viewport, modeId);
    if (!session) {
      this.sessions.delete(cacheKey);
      this.sessionSignatures.delete(cacheKey);
      return;
    }
    this.sessions.set(cacheKey, session);
    this.sessionSignatures.set(cacheKey, signature);
    this.syncToolState(viewport, session);
    return session;
  }

  public getActiveEditingSession(
    modeId?: EditingModeId,
  ): EditingSession | undefined {
    const id = this.viewportService.getActiveViewport()?.id;
    if (!id) {
      return;
    }
    return this.getEditingSession(id, modeId);
  }

  public getSelectionModel(
    viewportId?: string,
    modeId?: EditingModeId,
  ): SelectionModel | undefined {
    return this.getEditingSession(viewportId, modeId)?.selection;
  }

  /** The selection of the active viewport's editing session. */
  public getActiveSelectionModel(
    modeId?: EditingModeId,
  ): SelectionModel | undefined {
    return this.getActiveEditingSession(modeId)?.selection;
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
    if (!viewport || !this.midi) return false;
    return this.registry.canHost(
      this.resolveTrack(viewport).descriptor,
      hostKind,
    );
  }

  /** Returns the active viewport's session, if its view is supported. */
  public getActiveSession(): EditingSession | undefined {
    const viewport = this.viewportService.getActiveViewport();
    return viewport ? this.getEditingSession(viewport.id) : undefined;
  }

  private readonly syncDocument = (): void => {
    const snapshot = this.documentService.getSnapshot();
    const midi = snapshot.midi;
    if (midi === this.midi && snapshot.documentId === this.documentId) return;

    if (snapshot.documentId !== this.documentId) {
      // Clear before the sessions are dropped; they own the selection.
      this.getActiveSelectionModel()?.clear();
      this.clipboard.clear();
    }
    this.midi = midi;
    this.documentId = snapshot.documentId;
    this.commandExecutor = midi ? this.createCommandExecutor(midi) : null;
    this.sessionSignatures.clear();
    this.notify();
  };

  /** A new ruleset invalidates the document's track rules and every session. */
  private readonly syncRuleset = (): void => {
    const midi = this.midi;
    this.commandExecutor = midi ? this.createCommandExecutor(midi) : null;
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
      const separator = cacheKey.indexOf("::");
      const viewportId =
        separator < 0 ? cacheKey : cacheKey.slice(0, separator);
      // Stale sessions are kept until replaced so the selection carries over.
      if (!activeIds.has(viewportId)) {
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
    if (!this.midi || !this.commandExecutor) return null;
    const viewportTarget = this.resolveTrack(viewport);
    const mode = modeId
      ? this.registry.getById(
          modeId === "global" ? EditingModeId.MidiGlobal : modeId,
        )
      : this.registry.resolve(viewportTarget.descriptor, viewport.view);
    if (!mode) return null;

    const targetTrack =
      mode.id === EditingModeId.MidiGlobal
        ? this.resolveGlobalTrack()
        : viewportTarget;
    if (!targetTrack) return null;
    const { descriptor, trackIndex } = targetTrack;
    const target: IEditingTarget = {
      trackKey: descriptor.key,
      trackIndex,
      difficulty:
        mode.id === EditingModeId.MidiGlobal ? null : viewport.difficulty,
    };
    return new EditingSession({
      document: this.commandExecutor,
      mode,
      target,
      hostKind:
        mode.id === EditingModeId.MidiGlobal
          ? mode.id
          : (mode.hostKinds.values().next().value ?? viewport.view),
      rules: this.rulesetService.compiled,
      rulesContext: () => this.createRulesContext(),
      transaction: {
        begin: this.documentService.beginEdit,
        record: this.documentService.recordEdit,
        end: this.documentService.endEdit,
        rollback: this.documentService.rollbackEdit,
      },
      // Sessions share one selection; the first session creates it.
      selection: this.sessions.values().next().value?.selection,
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
      .find((track) => track.kind === "global");
    if (!descriptor) return null;
    const index = this.midi!.tracks.findIndex(
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
    const midi = this.midi;
    if (!midi) throw new Error("There is no MIDI document to resolve.");
    const song = new SongView(midi, this.rulesetService.compiled);
    const descriptors = song.getTrackDescriptors();
    if (viewport.trackKey.startsWith("unmapped-")) {
      const index = Number(viewport.trackKey.slice("unmapped-".length));
      const track = Number.isSafeInteger(index)
        ? song.getUnmappedMidiTracks()[index]
        : undefined;
      return {
        descriptor: this.createUnmappedDescriptor(
          viewport.trackKey,
          track?.name ?? viewport.instrument,
        ),
        trackIndex: track ? midi.tracks.indexOf(track) : null,
      };
    }
    const descriptor =
      descriptors.find(
        (item) =>
          item.key === viewport.trackKey || item.name === viewport.instrument,
      ) ??
      this.createUnmappedDescriptor(viewport.trackKey, viewport.instrument);
    const index = midi.tracks.findIndex(
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
    const midi = this.midi;
    const settings = this.documentService.getSnapshot().metadata.settings;
    const settingsSources = this.rulesetService.compiled.settingsSources;
    return createRulesetContext({
      ppqn: midi?.header.division ?? 480,
      settings: (source, key) => {
        const sourceDefinition = settingsSources.find(
          (item) => item.id === source,
        );
        const value =
          sourceDefinition?.file === "info.json" ? settings[key] : undefined;
        return typeof value === "boolean" ||
          typeof value === "number" ||
          typeof value === "string"
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
      this.documentId,
      this.rulesetService.snapshot.revision,
      modeId ?? "primary",
      viewport.trackKey,
      trackIndex,
      viewport.difficulty,
      modeId ? "global" : viewport.view,
    ].join(":");
  }

  private createCommandExecutor(midi: Midi): CommandExecutor {
    return new CommandExecutor(midi, this.rulesetService.compiled);
  }

  private publishResult(result: EditResult): void {
    this.lastResultValue = result;
    this.playbackService.refresh(this.documentService.data);
    for (const listener of [...this.resultListeners]) listener(result);
    this.notify();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
