import {
  MetaType,
  MidiTrack,
  type Midi,
  type MidiChannelEvent,
  type TempoEvent,
  type TimeSignatureEvent,
} from "@openchart/midi";
import {
  formatNoteId,
  parseEntityId,
  VocalTrackView,
  type EditingSession,
  type PreviewState,
} from "@openchart/views";
import { Box2, Vector2 } from "three";
import * as THREE from "three";
import { AbstractChartView, type ChartViewState } from "../AbstractChartView";
import { type Engine, type EngineOptions } from "../../../rendering/engine";
import { CoordinateSystem } from "./coordinates";
import { HeaderController, type HeaderLane } from "./controllers/header";
import { PianoRollInputController } from "./input/input";
import { PianoRollLabels } from "./controllers/labels";
import { NoteDataStore, toPianoRollNote } from "./noteData";
import { NoteEditingController } from "./controllers/noteEditing";
import { NoteGeometryCache } from "./rendering/geometry";
import { PointerContext } from "./input/pointer";
import {
  GENERIC_PROFILE,
  profileFromSession,
  type PianoRollProfile,
} from "./profile";
import { PianoRollRenderer } from "./rendering/rendering";
import { SelectionContext } from "./selection";
import type {
  PianoRollCamera,
  PianoRollCameraState,
  PianoRollContext,
  PianoRollNote,
  PianoRollVocalMarks,
  PianoRollVocalPlacement,
} from "./types";
import {
  DefaultCamera,
  DefaultTempoEvents,
  DefaultTimeSignatureEvents,
  EmptyMarks,
  KeyboardWidth,
} from "./constants";
import { cloneDeep } from "es-toolkit";

export class PianoRollView extends AbstractChartView<PianoRollNote> {
  public constructor(engineOptions?: EngineOptions) {
    super(engineOptions);
  }

  private readonly threeCamera = new THREE.OrthographicCamera(
    0,
    1,
    0,
    1,
    0.1,
    1000,
  );
  private readonly camera: PianoRollCamera = { ...DefaultCamera };
  private lastCamera: PianoRollCamera = { ...DefaultCamera };
  private profile: PianoRollProfile = GENERIC_PROFILE;
  /** Vertical camera remembered per profile across instrument switches. */
  private readonly profileCameras = new Map<
    PianoRollProfile["id"],
    { y: number; v: number }
  >();
  private pendingRangeFit = false;
  private vocalPlacement: PianoRollVocalPlacement = {
    noteKind: "pitched",
    phrase: null,
  };
  private vocalMarksKey: { track: MidiTrack; revision: number } | null = null;
  private vocalMarks: PianoRollVocalMarks = EmptyMarks;

  /** Audition hook for vocal pitch feedback on place/move. */
  public onNotePreview: ((notes: readonly PianoRollNote[]) => void) | null =
    null;

  private readonly pointer = new PointerContext();
  private readonly selection = new SelectionContext();
  private editingSession: EditingSession | null = null;
  private globalEditingSession: EditingSession | null = null;
  private editingUnsubscribers: Array<() => void> = [];
  private previewState: PreviewState | null = null;
  private previewTrack: MidiTrack | null = null;
  private displayNotesCache: {
    source: PianoRollNote[];
    preview: PreviewState;
    trackIndex: number;
    notes: PianoRollNote[];
  } | null = null;
  private lyricPromptInput: HTMLInputElement | null = null;

  private readonly noteData = new NoteDataStore();
  private readonly geometry = new NoteGeometryCache();
  private readonly coordinates = new CoordinateSystem(
    {
      getPpqn: () => this.getPpqn(),
      getState: () => this.state,
      getTempoEvents: () => this.#tempoEvents,
      getProfile: () => this.profile,
      getViewport: () => ({ height: this.#lastViewportSize.y }),
    },
    this.camera,
  );
  private readonly context: PianoRollContext = {
    getState: () => this.state,
    getMidi: () => this.state.midi,
    getPpqn: () => this.getPpqn(),
    getSelectedTrack: () => this.getSelectedTrack(),
    getSelectedTrackIndex: () => this.getSelectedTrackIndex(),
    getProfile: () => this.profile,
    getVocalPlacement: () => this.vocalPlacement,
    getVocalMarks: () => this.getVocalMarks(),
    getTrackNotes: (midi, trackIndex) =>
      this.noteData.getTrackNotes(midi, trackIndex),
    getCurrentNotes: () => this.noteData.currentNotes,
    getTempoEvents: () => this.#tempoEvents,
    getTimeSignatureEvents: () => this.#timeSignatureEvents,
    getTextEvents: () => {
      const events = this.getSelectedTrack()?.getTextEvents() ?? [];
      return this.profile.header.textLane === "lyrics"
        ? events.filter((event) => event.type === MetaType.Lyric)
        : events;
    },
    getCamera: () => this.camera,
    getViewport: () => ({
      width: this.#lastViewportSize.x,
      height: this.#lastViewportSize.y,
    }),
    getPointerContext: () => this.pointer,
    getSelectionContext: () => this.selection,
    getEditingSession: () => this.editingSession,
    getGlobalEditingSession: () => this.globalEditingSession,
    getPreviewState: () => this.previewState,
    setPreviewState: (preview) => {
      this.previewState = preview;
      this.displayNotesCache = null;
      if (!preview) this.previewTrack = null;
      this.render();
    },
    getDisplayNotes: (notes) => this.getDisplayNotes(notes),
    requestRender: () => this.render(),
    requestSeek: (tick) => this.onSeekRequest?.(tick),
    invalidateTempoCache: () => {
      this.#tempoCacheMidi = null;
    },
    promptLyric: (tick, handlers) => this.header.promptText(tick, handlers),
    cancelLyricPrompt: () => this.header.cancelPrompt(),
    editNextLyric: (afterTick) => this.editNextLyric(afterTick),
    previewNotes: (notes) => this.onNotePreview?.(notes),
  };
  private readonly editing = new NoteEditingController(
    this.context,
    this.coordinates,
  );
  private readonly header = new HeaderController(
    this.context,
    this.coordinates,
  );
  private readonly labels = new PianoRollLabels(
    this.context,
    this.coordinates,
    this.header,
  );
  private readonly renderer = new PianoRollRenderer(
    this.context,
    this.coordinates,
    this.noteData,
    this.geometry,
    this.header,
  );
  private readonly input = new PianoRollInputController(
    this.context,
    this.coordinates,
    this.geometry,
    this.editing,
    this.header,
  );

  #tempoCacheMidi: Midi | null = null;
  #tempoEvents: TempoEvent[] = cloneDeep(DefaultTempoEvents);
  #timeSignatureEvents: TimeSignatureEvent[] = cloneDeep(
    DefaultTimeSignatureEvents,
  );
  #canvas: HTMLCanvasElement | null = null;
  #playheadTick = 0;
  #lastViewportSize = new Vector2(1, 1);

  public getProfile(): PianoRollProfile {
    return this.profile;
  }

  /**
   * Switches pitch range, pinned lanes, editing and header behaviour without
   * rebuilding the renderer (which would reset the camera), mirroring
   * HighwayView.setMode().
   */
  private applyProfile(profile: PianoRollProfile): void {
    if (profile === this.profile) return;
    this.input.cancelNoteEditing();
    this.profileCameras.set(this.profile.id, {
      y: this.camera.y,
      v: this.camera.v,
    });
    this.profile = profile;
    this.geometry.clear();
    this.noteData.clear();
    this.vocalMarksKey = null;
    const saved = this.profileCameras.get(profile.id);
    if (saved) {
      this.camera.y = saved.y;
      this.camera.v = saved.v;
      this.camera.y = this.coordinates.clampCameraY(this.camera.y);
    } else if (profile.id === "vocals") {
      this.fitPitchRange();
    } else {
      this.camera.y = DefaultCamera.y;
      this.camera.v = DefaultCamera.v;
      this.camera.y = this.coordinates.clampCameraY(this.camera.y);
    }
    this.render();
  }

  public setVocalPlacement(placement: PianoRollVocalPlacement): void {
    this.vocalPlacement = placement;
  }

  /** Sets the header lanes to render; all lanes are shown by default. */
  public setHeaderLanes(lanes: readonly HeaderLane[]): void {
    this.header.setVisibleLanes(lanes);
  }

  /** Fits the profile's pitch range (C2-C6 for vocals) into the viewport. */
  public fitPitchRange(): void {
    if (this.#lastViewportSize.y <= 1) {
      this.pendingRangeFit = true;
      return;
    }
    this.pendingRangeFit = false;
    this.coordinates.fitPitchRange(this.#lastViewportSize.y);
    this.render();
  }

  public getCameraState(): PianoRollCameraState {
    return {
      profile: this.profile.id,
      y: this.camera.y,
      v: this.camera.v,
      h: this.camera.h,
    };
  }

  /** Restores a persisted camera if it was saved for the current profile. */
  public applyCameraState(state: unknown): boolean {
    if (
      !isPianoRollCameraState(state) ||
      (state.profile !== this.profile.id &&
        !(state.profile === "generic" && this.profile.id === "midi.raw"))
    ) {
      return false;
    }
    this.pendingRangeFit = false;
    this.camera.v = state.v;
    this.camera.h = state.h;
    this.camera.y = this.coordinates.clampCameraY(state.y);
    this.render();
    return true;
  }

  public getPointerContext(): PointerContext {
    return this.pointer;
  }

  public getSelectionContext(): SelectionContext {
    return this.selection;
  }

  public override update(state: ChartViewState): void {
    const playbackStarted = !this.state.isPlaying && state.isPlaying;
    super.update(state);
    this.selection.refreshSharedSelection();
    if (playbackStarted) {
      this.input.cancelNoteEditing();
    }
  }

  public override getCameraTick(): number {
    return this.camera.x;
  }

  public override getVisibleTickSpan(): number {
    return this.coordinates.getVisibleTickSpan(this.#lastViewportSize.x);
  }

  public override setCameraTick(tick: number): void {
    this.coordinates.setCameraTick(tick);
    this.render();
  }

  public override setPlayheadTick(tick: number): void {
    this.#playheadTick = tick;
    this.render();
  }

  public override async mount(host: HTMLElement): Promise<void> {
    await super.mount(host);
    if (!this.#canvas) return;
    this.header.mount(host);
    this.labels.mount(host);
    this.lyricPromptInput = this.header.getEditInput();
    this.lyricPromptInput?.addEventListener(
      "keydown",
      this.handleEmptyLyricEnter,
      true,
    );
  }

  protected override get renderScene(): THREE.Scene {
    return this.renderer.scene;
  }

  protected override get renderCamera(): THREE.Camera {
    return this.threeCamera;
  }

  protected override onMounted(engine: Engine): void {
    this.#canvas = engine.canvas;
    this.input.attach(this.#canvas);
    this.threeCamera.rotation.set(0, 0, 0);
  }

  public override destroy(): void {
    this.input.detach();
    this.lyricPromptInput?.removeEventListener(
      "keydown",
      this.handleEmptyLyricEnter,
      true,
    );
    this.lyricPromptInput = null;
    this.header.destroy();
    this.labels.destroy();
    this.#canvas = null;
    this.geometry.clear();
    this.noteData.clear();
    this.renderer.dispose();
    for (const unsubscribe of this.editingUnsubscribers) unsubscribe();
    this.editingUnsubscribers = [];
    super.destroy();
  }

  public override setEditingSession(session: EditingSession | null): void {
    if (this.editingSession === session) return;
    this.input.cancelNoteEditing();
    for (const unsubscribe of this.editingUnsubscribers) unsubscribe();
    this.editingUnsubscribers = [];
    this.editingSession = session;
    this.previewState = null;
    this.previewTrack = null;
    this.displayNotesCache = null;
    if (session) {
      this.selection.bindSharedSelection(
        session.selection,
        this.resolveSelectionId,
      );
      this.editingUnsubscribers.push(
        session.selection.subscribe(() => this.render()),
      );
      this.applyProfile(profileFromSession(session));
    } else {
      this.selection.unbindSharedSelection();
      this.applyProfile(GENERIC_PROFILE);
    }
    this.render();
  }

  public setGlobalEditingSession(session: EditingSession | null): void {
    this.globalEditingSession = session;
  }

  protected override draw(engine: Engine): void {
    // Store last viewport size
    const { x: width, y: height } = engine.size;
    this.#lastViewportSize.set(width, height);

    // Initialize camera size, position, and proj. matrix
    this.threeCamera.left = 0;
    this.threeCamera.right = width;
    this.threeCamera.top = 0;
    this.threeCamera.bottom = height;
    this.threeCamera.position.set(0, 0, 10);
    this.threeCamera.updateProjectionMatrix();

    // Update input viewport capture space
    this.input.setViewport(width, height);

    // Update tempo cache
    this.updateTempoCache();
    if (this.pendingRangeFit && height > 1) {
      this.pendingRangeFit = false;
      this.coordinates.fitPitchRange(height);
    }
    this.camera.y = this.coordinates.clampCameraY(this.camera.y);

    // Draw geometry
    this.renderer.draw(width, height, this.#playheadTick);

    // Draw labels
    this.labels.draw(height);

    // If the camera changed, update the last camera and
    // notify
    if (this.camera !== this.lastCamera) {
      this.lastCamera = { ...this.camera };
      this.notifyCameraChange();
    }
  }

  public override getTrackNotes(
    midi: Midi,
    trackIndex: number,
  ): PianoRollNote[] {
    return this.noteData.getTrackNotes(midi, trackIndex);
  }

  private readonly resolveSelectionId = (id: string): PianoRollNote | null => {
    const midi = this.state.midi;
    const trackIndex = this.getSelectedTrackIndex();
    const parsed = parseEntityId(id);
    if (
      !midi ||
      trackIndex === null ||
      parsed?.kind !== "note" ||
      parsed.trackIndex !== trackIndex
    ) {
      return null;
    }
    const track = midi.tracks[trackIndex];
    const note = track?.getNoteByEventId(parsed.eventId);
    return track && note ? toPianoRollNote(track, trackIndex, note) : null;
  };

  private getDisplayNotes(notes: PianoRollNote[]): PianoRollNote[] {
    const preview = this.previewState;
    const trackIndex = this.getSelectedTrackIndex();
    if (!preview || trackIndex === null) return notes;
    const cached = this.displayNotesCache;
    if (
      cached?.source === notes &&
      cached.preview === preview &&
      cached.trackIndex === trackIndex
    ) {
      return cached.notes;
    }
    const displayed = notes
      .filter((note) => !preview.removed.has(note.id))
      .map((note) => {
        const updated = preview.updated.get(note.id);
        if (!updated) return note;
        return {
          ...note,
          tick: updated.tick,
          pitch: updated.pitch,
          durationTicks: updated.duration,
          velocity: updated.velocity,
        };
      })
      .concat(
        preview.added
          .filter((note) => note.trackIndex === trackIndex)
          .map((note) => ({
            id: note.id,
            tick: note.tick,
            durationTicks: note.duration,
            pitch: note.pitch,
            velocity: note.velocity,
            midiNote: null,
          })),
      )
      .sort((left, right) => left.tick - right.tick);
    this.displayNotesCache = {
      source: notes,
      preview,
      trackIndex,
      notes: displayed,
    };
    return displayed;
  }

  /** Discriminant for `AnyChartView`. */
  public readonly kind = "piano-roll" as const;

  public focusSelection(): void {
    this.input.focusSelection();
  }

  public transposeSelection(semitones: number): void {
    this.input.transposeSelection(semitones);
  }

  public moveSelection(direction: -1 | 1): void {
    this.input.moveSelection(direction);
  }

  public selectAll(): void {
    this.input.selectAll();
  }

  public clearSelection(): void {
    this.input.clearSelection();
  }

  public deleteSelection(): void {
    this.input.deleteSelection();
  }

  public getPasteAnchorTick(): number {
    return this.input.getPasteAnchorTick();
  }

  public drawCursor(width: number, height: number): void {
    this.renderer.drawCursor(width, height, this.#playheadTick);
  }

  protected override toScreenSpace(value: Vector2): Vector2;
  protected override toScreenSpace(value: Box2): Box2;
  protected override toScreenSpace(value: Vector2 | Box2): Vector2 | Box2 {
    if (value instanceof Box2) {
      return this.coordinates.toScreenSpace(value);
    }
    return this.coordinates.toScreenSpace(value);
  }

  private getSelectedTrack(): MidiTrack | null {
    const midi = this.state.midi;
    if (!midi) return null;
    const trackIndex =
      this.editingSession?.target.trackIndex ?? this.state.selectedTrackIndex;
    if (trackIndex !== null) return midi.tracks[trackIndex] ?? null;
    const trackName = this.state.selectedInstrument;
    const track = trackName ? (midi.getTrack(trackName) ?? null) : null;
    if (track) return track;
    if (
      this.previewState?.added.length &&
      this.editingSession?.mode.capabilities.canCreateTrack
    ) {
      this.previewTrack ??= new MidiTrack(trackName);
      return this.previewTrack;
    }
    return null;
  }

  private getSelectedTrackIndex(): number | null {
    const sessionTrackIndex = this.editingSession?.target.trackIndex;
    if (sessionTrackIndex !== null && sessionTrackIndex !== undefined) {
      return sessionTrackIndex;
    }
    const midi = this.state.midi;
    const track = this.getSelectedTrack();
    if (!midi || !track) {
      const previewTrackIndex = this.previewState?.added[0]?.trackIndex;
      if (
        previewTrackIndex !== undefined &&
        this.editingSession?.mode.capabilities.canCreateTrack
      ) {
        return previewTrackIndex;
      }
      return null;
    }
    const index = midi.tracks.indexOf(track);
    if (index >= 0) return index;
    const previewTrackIndex = this.previewState?.added[0]?.trackIndex;
    return previewTrackIndex ?? null;
  }

  /** Missing-lyric marks, recomputed only when the track's revision moves. */
  private getVocalMarks(): PianoRollVocalMarks {
    const layout = this.profile.vocal;
    const track = this.getSelectedTrack();
    if (!layout || !track) return EmptyMarks;
    const revision = track.getNoteRevision();
    if (
      this.vocalMarksKey?.track === track &&
      this.vocalMarksKey.revision === revision
    ) {
      return this.vocalMarks;
    }
    const missingLyric = new Set<MidiChannelEvent>();
    const missingTicks: number[] = [];
    for (const issue of VocalTrackView.validateTrack(track, layout)) {
      if (issue.type !== "missing-lyric") continue;
      missingLyric.add(issue.note.noteOn);
      missingTicks.push(issue.tick);
    }
    this.vocalMarksKey = { track, revision };
    this.vocalMarks = { missingLyric, missingTicks };
    return this.vocalMarks;
  }

  /**
   * Tab from a lyric: open the next pitched/pitchless note's lyric for
   * editing, or prompt for one when it has none, scrolling it into view.
   */
  private editNextLyric(afterTick: number): void {
    const layout = this.profile.vocal;
    const track = this.getSelectedTrack();
    if (!layout || !track || this.state.isPlaying) return;
    const next = VocalTrackView.readNotes(track, layout)
      .filter((item) => VocalTrackView.kindNeedsLyric(item.kind))
      .find((item) => item.note.start > afterTick);
    if (!next) return;

    const x = this.coordinates.screenXForTick(next.note.start);
    if (x < KeyboardWidth || x > this.#lastViewportSize.x - 80) {
      this.coordinates.setCameraTick(
        next.note.start - this.getVisibleTickSpan() / 4,
      );
    }
    const tick = next.note.start;
    const write = (text: string): boolean => {
      const session = this.editingSession;
      const trackIndex = this.getSelectedTrackIndex();
      if (!session || trackIndex === null) return false;
      return session.execute({
        type: "SET_LYRIC",
        id: formatNoteId(trackIndex, track.getEventId(next.note.noteOn)),
        text,
      }).changed;
    };
    if (next.lyric) {
      this.header.editTextAt(tick, write);
    } else {
      this.header.promptText(tick, {
        onCommit: write,
        onCancel: () => {},
        onTab: (text) => {
          if (write(text)) this.editNextLyric(tick);
        },
      });
    }
    this.render();
  }

  private updateTempoCache(): void {
    const midi = this.state.midi;
    if (midi === this.#tempoCacheMidi) {
      return;
    }
    this.#tempoCacheMidi = midi;
    this.#tempoEvents = midi?.getTempoEvents() ?? [...DefaultTempoEvents];
    this.#timeSignatureEvents = midi?.getTimeSignatureEvents() ?? [
      ...DefaultTimeSignatureEvents,
    ];
  }

  private readonly handleEmptyLyricEnter = (event: KeyboardEvent): void => {
    if (
      event.key !== "Enter" ||
      !this.header.isPrompting ||
      this.lyricPromptInput?.value.trim() !== ""
    ) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.header.cancelPrompt();
  };
}

export type { PianoRollNote } from "./types";

function isPianoRollCameraState(value: unknown): value is PianoRollCameraState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return (
    (state.profile === "midi.raw" ||
      state.profile === "generic" ||
      state.profile === "vocals") &&
    [state.y, state.v, state.h].every(
      (item) => typeof item === "number" && Number.isFinite(item),
    )
  );
}

export { GENERIC_PROFILE } from "./profile";
export type { PianoRollProfile } from "./profile";
export type { PianoRollVocalPlacement } from "./types";
