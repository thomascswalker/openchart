import type { Midi } from "@openchart/midi";
import {
  ChartDocument,
  ClipboardService,
  createRulesetContext,
  createUnmappedTrackRules,
  EditingModeRegistry,
  SelectionModel,
  SongView,
  createEditingSession,
  type EditingModeId,
  type EditingSession,
  type EditingTarget,
  type EditResult,
  type ModeRegistry,
  type TrackDescriptor,
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

  /** @deprecated Removed after the Piano Roll migration in Phase 6. */
  public readonly selection = new SelectionModel();
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
  private chartDocument: ChartDocument | null = null;
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
    const chartDocument = this.createChartDocument(documentService.data);
    this.chartDocument = chartDocument;
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
    this.selection.clear();
    this.clipboard.clear();
    this.sessions.clear();
    this.sessionSignatures.clear();
    this.syncDocument();
    this.notify();
  };

  /** @deprecated Use the active EditingSession. */
  public getDocument(): ChartDocument {
    if (!this.chartDocument) {
      throw new Error("There is no MIDI document to edit.");
    }
    return this.chartDocument;
  }

  /** Returns the cached session for the specified viewport, if supported. */
  public getSession(
    viewportId: string,
    requestedModeId?: EditingModeId | "global",
  ): EditingSession | null {
    const viewport = this.viewportService.getViewport(viewportId);
    if (!viewport || !this.chartDocument || !this.midi) return null;
    const modeId =
      requestedModeId === "global" ? "midi.global" : requestedModeId;
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
    if (!viewport || !this.midi) return false;
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
    const snapshot = this.documentService.getSnapshot();
    const midi = snapshot.midi;
    if (midi === this.midi && snapshot.documentId === this.documentId) return;

    const projectChanged = snapshot.documentId !== this.documentId;
    this.midi = midi;
    this.documentId = snapshot.documentId;
    this.chartDocument = midi ? this.createChartDocument(midi) : null;
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
    const midi = this.midi;
    this.chartDocument = midi ? this.createChartDocument(midi) : null;
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
      const separator = cacheKey.indexOf("::");
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
    if (!this.midi || !this.chartDocument) return null;
    const viewportTarget = this.resolveTrack(viewport);
    const mode = modeId
      ? this.registry.getById(modeId)
      : this.registry.resolve(viewportTarget.descriptor, viewport.view);
    if (!mode) return null;

    const targetTrack =
      mode.id === "midi.global" ? this.resolveGlobalTrack() : viewportTarget;
    if (!targetTrack) return null;
    const { descriptor, trackIndex } = targetTrack;
    const target: EditingTarget = {
      trackKey: descriptor.key,
      trackIndex,
      difficulty: mode.id === "midi.global" ? null : viewport.difficulty,
    };
    return createEditingSession({
      document: this.chartDocument,
      mode,
      target,
      hostKind: mode.hostKinds.values().next().value ?? viewport.view,
      rules: this.rulesetService.compiled,
      rulesContext: () => this.createRulesContext(),
      transaction: {
        begin: this.documentService.beginEdit,
        record: this.documentService.recordEdit,
        end: this.documentService.endEdit,
        rollback: this.documentService.rollbackEdit,
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

  private createChartDocument(midi: Midi): ChartDocument {
    return new ChartDocument(midi, this.rulesetService.compiled);
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

/** @deprecated Use EditingService. */
export type EditorEditingService = EditingService;
