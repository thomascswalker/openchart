import type { Midi } from "@openchart/midi";
import {
  ChartDocument,
  ClipboardService,
  defaultConfig,
  EditScratchpad,
  EditingModeRegistry,
  getPhrasePitch,
  SelectionModel,
  SongView,
  upgradeLegacyAction,
  createEditingSession,
  type ChartEditAction,
  type EditingSession,
  type EditingTarget,
  type EditResult,
  type EditablePhraseKind,
  type ModeRegistry,
  type TrackDescriptor,
} from "@openchart/views";
import { Service } from "../../platform/services";
import { DocumentService } from "../document";
import { PlaybackService } from "../playback";
import { ViewportService, type ViewportSession } from "./viewports";
import { defaultModes } from "@openchart/views";

type ResultListener = (result: EditResult) => void;

/** Bridges editing modes and sessions to editor history and playback. */
export class EditingService extends Service {
  public static dependencies = ["document", "playback", "editor.viewports"];

  /** @deprecated Removed after the Piano Roll migration in Phase 6. */
  public readonly selection = new SelectionModel();
  /** @deprecated Removed after the Piano Roll migration in Phase 6. */
  public readonly scratchpad = new EditScratchpad();
  /** @deprecated Replaced by the mode-aware clipboard in Phase 8. */
  public readonly clipboard: ClipboardService;

  public readonly registry: ModeRegistry;

  private readonly documentService: DocumentService;
  private readonly playbackService: PlaybackService;
  private readonly viewportService: ViewportService;
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
  ) {
    super();
    this.documentService = documentService;
    this.playbackService = playbackService;
    this.viewportService = viewportService;
    this.registry = new EditingModeRegistry();
    defaultModes.forEach((mode) => this.registry.register(mode));
    this.midi = documentService.data;
    this.documentId = documentService.getSnapshot().documentId;
    const chartDocument = this.createChartDocument(documentService.data);
    this.chartDocument = chartDocument;
    this.clipboard = new ClipboardService(
      chartDocument,
      this.selection,
      (trackIndex, pitch) => this.getPhraseType(trackIndex, pitch),
    );
    this.documentService.subscribe(this.syncDocument);
    this.viewportService.subscribe(this.syncViewports);
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
    this.scratchpad.clear();
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
  public getSession(viewportId: string): EditingSession | null {
    const viewport = this.viewportService.getViewport(viewportId);
    if (!viewport || !this.chartDocument || !this.midi) return null;
    const signature = this.sessionSignature(viewport);
    if (this.sessionSignatures.get(viewportId) === signature) {
      return this.sessions.get(viewportId) ?? null;
    }

    this.sessions.delete(viewportId);
    this.sessionSignatures.delete(viewportId);
    const session = this.createSession(viewport);
    if (!session) return null;
    this.sessions.set(viewportId, session);
    this.sessionSignatures.set(viewportId, signature);
    return session;
  }

  /** Returns the active viewport's session, if its view is supported. */
  public getActiveSession(): EditingSession | null {
    const viewport = this.viewportService.getActiveViewport();
    return viewport ? this.getSession(viewport.id) : null;
  }

  /** @deprecated Use EditingSession.execute. */
  public dispatch = (action: ChartEditAction): boolean => {
    const session = this.getActiveSession();
    if (!session)
      throw new Error("The active viewport has no editing session.");
    return session.execute(this.upgradeLegacy(action)).changed;
  };

  /** @deprecated Use EditingSession.executeBatch. */
  public dispatchBatch = (actions: readonly ChartEditAction[]): boolean => {
    const session = this.getActiveSession();
    if (!session)
      throw new Error("The active viewport has no editing session.");
    return session.executeBatch(
      actions.map((action) => this.upgradeLegacy(action)),
    ).changed;
  };

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
    if (this.chartDocument) this.clipboard.setDocument(this.chartDocument);
    if (projectChanged) {
      this.selection.clear();
      this.scratchpad.clear();
      this.clipboard.clear();
    }
    this.notify();
  };

  private readonly syncViewports = (): void => {
    const activeIds = new Set(
      this.viewportService
        .getSnapshot()
        .viewportSessions.map((viewport) => viewport.id),
    );
    for (const viewportId of this.sessions.keys()) {
      const viewport = this.viewportService.getViewport(viewportId);
      if (
        !activeIds.has(viewportId) ||
        !viewport ||
        this.sessionSignatures.get(viewportId) !==
          this.sessionSignature(viewport)
      ) {
        this.sessions.delete(viewportId);
        this.sessionSignatures.delete(viewportId);
      }
    }
    this.notify();
  };

  private createSession(viewport: ViewportSession): EditingSession | null {
    if (!this.midi || !this.chartDocument) return null;
    const { descriptor, trackIndex } = this.resolveTrack(viewport);
    const mode = this.registry.resolve(descriptor, viewport.view);
    if (!mode) return null;

    const target: EditingTarget = {
      trackKey: viewport.trackKey,
      trackIndex,
      difficulty: viewport.difficulty,
    };
    return createEditingSession({
      document: this.chartDocument,
      mode,
      target,
      hostKind: viewport.view,
      config: defaultConfig,
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

  private resolveTrack(viewport: ViewportSession): {
    descriptor: TrackDescriptor;
    trackIndex: number | null;
  } {
    const midi = this.midi;
    if (!midi) throw new Error("There is no MIDI document to resolve.");
    const song = new SongView(midi);
    const descriptors = song.getTrackDescriptors();
    if (viewport.trackKey.startsWith("unmapped-")) {
      const index = Number(viewport.trackKey.slice("unmapped-".length));
      const track = Number.isSafeInteger(index)
        ? song.getUnmappedMidiTracks()[index]
        : undefined;
      const descriptor = this.createSyntheticDescriptor(
        viewport.trackKey,
        track?.name ?? viewport.instrument,
      );
      return {
        descriptor,
        trackIndex: track ? midi.tracks.indexOf(track) : null,
      };
    }
    const descriptor =
      descriptors.find(
        (item) =>
          item.key === viewport.trackKey || item.name === viewport.instrument,
      ) ??
      this.createSyntheticDescriptor(viewport.trackKey, viewport.instrument);
    const index = midi.tracks.findIndex(
      (track) => track.name === descriptor.name,
    );
    return { descriptor, trackIndex: index >= 0 ? index : null };
  }

  private createSyntheticDescriptor(
    key: string,
    name: string,
  ): TrackDescriptor {
    const config = {
      name,
      key,
      type: "instrument" as const,
      noteCount: 128,
      notes: {},
    };
    return {
      key,
      name,
      type: "instrument",
      visible: true,
      editable: true,
      config,
    };
  }

  private sessionSignature(viewport: ViewportSession): string {
    const { trackIndex } = this.resolveTrack(viewport);
    return [
      this.documentId,
      viewport.trackKey,
      trackIndex,
      viewport.difficulty,
      viewport.view,
    ].join(":");
  }

  private createChartDocument(midi: Midi): ChartDocument {
    const song = new SongView(midi);
    const descriptors = song.getTrackDescriptors();
    return new ChartDocument(
      midi,
      (trackIndex, phraseType) => {
        const track = midi.tracks[trackIndex];
        const descriptor = descriptors.find(
          (item) => item.name === track?.name,
        );
        return descriptor ? getPhrasePitch(descriptor, phraseType) : null;
      },
      defaultConfig,
    );
  }

  private upgradeLegacy(action: ChartEditAction) {
    return upgradeLegacyAction(action, {
      resolvePhrasePitch: (trackIndex, phraseType) => {
        const descriptor = this.chartDocument?.getTrackDescriptor(trackIndex);
        return descriptor ? getPhrasePitch(descriptor, phraseType) : null;
      },
      getNote: (id) => this.chartDocument?.getNote(id) ?? null,
    });
  }

  private getPhraseType(
    trackIndex: number,
    pitch: number,
  ): EditablePhraseKind | null {
    const descriptor = this.chartDocument?.getTrackDescriptor(trackIndex);
    if (!descriptor) return null;
    for (const phraseType of [
      "stagepower",
      "solo",
      "vocal",
      "power-window",
    ] as const) {
      if (getPhrasePitch(descriptor, phraseType) === pitch) return phraseType;
    }
    return null;
  }

  private publishResult(result: EditResult): void {
    this.lastResultValue = result;
    this.playbackService.refresh(this.documentService.data);
    for (const listener of [...this.resultListeners]) listener(result);
    this.notify();
  }
}

function emptyResult(): EditResult {
  return {
    changed: false,
    createdIds: [],
    updatedIds: [],
    removedIds: [],
    rejections: [],
  };
}

/** @deprecated Use EditingService. */
export type EditorEditingService = EditingService;
