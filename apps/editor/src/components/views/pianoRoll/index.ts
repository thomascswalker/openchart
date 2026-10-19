import {
  MetaType,
  type Midi,
  type MidiChannelEvent,
  type MidiNote,
  type MidiTrack,
  type TempoEvent,
  type TextEvent,
  type TimeSignatureEvent,
} from "@openchart/core";
import {
  getVocalNotes,
  setVocalLyric,
  SongView,
  validateVocalTrack,
  vocalKindNeedsLyric,
  type VocalLayout,
} from "@openchart/views";
import * as THREE from "three";
import { AbstractChartView, type ChartViewState } from "../AbstractChartView";
import type { Engine } from "../../../rendering/engine";
import {
  DefaultMicrosecondsPerQuarterNote,
  DefaultTimeSignature,
  KeyboardWidth,
} from "./constants";
import { CoordinateSystem } from "./coordinates";
import { HeaderController, type HeaderLane } from "./header";
import { PianoRollInputController } from "./input";
import { PianoRollLabels } from "./labels";
import { NoteDataStore } from "./noteData";
import { NoteEditingController } from "./editing/controller";
import { NoteGeometryCache } from "./noteGeometry";
import { PointerContext } from "./pointer";
import { DefaultProfile, type PianoRollProfile } from "./profile";
import { PianoRollRenderer } from "./rendering";
import { SelectionContext } from "./selection";
import type {
  PianoRollCamera,
  PianoRollContext,
  PianoRollNote,
  VocalMarks,
  VocalPlacement,
} from "./types";

/** Serializable vertical/zoom camera, persisted in ViewportCameraState. */
export interface PianoRollCameraState {
  /** Profile the camera was saved for; it is only restored for the same one. */
  profile: PianoRollProfile["id"];

  /** Pitch at the top edge of the viewport. */
  y: number;

  /** Vertical zoom. */
  v: number;

  /** Horizontal zoom. */
  h: number;
}

/** Camera a new piano roll starts with, and the one unseen profiles reset to. */
const DefaultCamera: Readonly<PianoRollCamera> = { x: 0, y: 84, h: 120, v: 18 };

/** Validation marks for a view with no vocal track to validate. */
const EMPTY_MARKS: VocalMarks = { missingLyric: new Set(), missingTicks: [] };

/** Distance, in pixels, from the right edge that triggers scrolling to a lyric. */
const LyricScrollMarginPixels = 80;

/** Share of the visible ticks left before a lyric that is scrolled into view. */
const LyricScrollLeadRatio = 1 / 4;

/** Tempo map used until a document supplies one. */
function createDefaultTempoEvents(): TempoEvent[] {
  return [
    { tick: 0, microsecondsPerQuarterNote: DefaultMicrosecondsPerQuarterNote },
  ];
}

/** Time signature map used until a document supplies one. */
function createDefaultTimeSignatureEvents(): TimeSignatureEvent[] {
  return [{ tick: 0, ...DefaultTimeSignature }];
}

/** True when `value` is a finite number. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Type guard for a persisted camera state of unknown origin. */
function isPianoRollCameraState(value: unknown): value is PianoRollCameraState {
  if (typeof value !== "object" || value === null) return false;

  const state = value as Record<string, unknown>;
  const hasKnownProfile =
    state.profile === "default" || state.profile === "vocals";

  return hasKnownProfile && [state.y, state.v, state.h].every(isFiniteNumber);
}

/** Finds the notes of a vocal track that have no lyric. */
function collectVocalMarks(track: MidiTrack, layout: VocalLayout): VocalMarks {
  const missingLyric = new Set<MidiChannelEvent>();
  const missingTicks: number[] = [];

  for (const issue of validateVocalTrack(track, layout)) {
    if (issue.type !== "missing-lyric") continue;

    missingLyric.add(issue.note.noteOn);
    missingTicks.push(issue.tick);
  }

  return { missingLyric, missingTicks };
}

/** The Three.js piano-roll chart view: a scrolling pitch/time grid of notes. */
export class PianoRollView extends AbstractChartView<PianoRollNote> {
  /** Orthographic camera whose frustum is resized to the canvas each frame. */
  private readonly threeCamera = new THREE.OrthographicCamera(
    0, // left
    1, // right
    0, // top
    1, // bottom
    0.1, // near
    1000, // far
  );

  /** Live camera onto the note grid; mutated by panning and zooming. */
  private readonly camera: PianoRollCamera = { ...DefaultCamera };

  /** Camera as of the last change notification. */
  private lastCamera: PianoRollCamera = { ...DefaultCamera };

  /** Active instrument profile. */
  private profile: PianoRollProfile = DefaultProfile;

  /** Vertical camera remembered per profile across instrument switches. */
  private readonly profileCameras = new Map<
    PianoRollProfile["id"],
    { y: number; v: number }
  >();

  /** True when a pitch-range fit was requested before the canvas had a size. */
  private pendingRangeFit = false;

  /** What the toolbar says a vocal drag in the grid creates. */
  private vocalPlacement: VocalPlacement = {
    noteKind: "pitched",
    phrase: null,
  };

  /** Track and revision the cached vocal marks were computed for. */
  private vocalMarksKey: { track: MidiTrack; revision: number } | null = null;

  /** Cached missing-lyric marks of the selected vocal track. */
  private vocalMarks: VocalMarks = EMPTY_MARKS;

  /** Audition hook for vocal pitch feedback on place/move. */
  public onNotePreview: ((notes: readonly PianoRollNote[]) => void) | null =
    null;

  /** State of the pointer gesture in progress. */
  private readonly pointer = new PointerContext();

  /** The selected notes and marquee. */
  private readonly selection = new SelectionContext();

  /** Maps document notes to piano-roll notes and indexes them. */
  private readonly noteData = new NoteDataStore();

  /** Cached note rectangles near the viewport. */
  private readonly geometry = new NoteGeometryCache();

  /** Tick/pixel conversion and camera math. */
  private readonly coordinates = new CoordinateSystem(
    {
      getPpqn: () => this.getPpqn(),
      getState: () => this.state,
      getTempoEvents: () => this.tempoEvents,
      getProfile: () => this.profile,
      getViewport: () => ({ height: this.lastHeight }),
    },
    this.camera,
  );

  /** The narrow dependency surface handed to every controller. */
  private readonly context: PianoRollContext = {
    getState: () => this.state,
    getMidi: () => this.state.midi,
    getPpqn: () => this.getPpqn(),
    getSelectedTrack: () => this.getSelectedTrack(),
    getSelectedTrackIndex: () => this.getSelectedTrackIndex(),
    getSelectedTrackKey: () => this.getSelectedTrackKey(),
    getProfile: () => this.profile,
    getVocalPlacement: () => this.vocalPlacement,
    getVocalMarks: () => this.getVocalMarks(),
    getTrackNotes: (midi, trackIndex) =>
      this.noteData.getTrackNotes(midi, trackIndex),
    getCurrentNotes: () => this.noteData.currentNotes,
    getTempoEvents: () => this.tempoEvents,
    getTimeSignatureEvents: () => this.timeSignatureEvents,
    getTextEvents: () => this.getHeaderTextEvents(),
    getCamera: () => this.camera,
    getViewport: () => ({ width: this.lastWidth, height: this.lastHeight }),
    getPointerContext: () => this.pointer,
    getSelectionContext: () => this.selection,
    requestRender: () => this.render(),
    beginEdit: () => this.onBeginEdit?.(),
    endEdit: () => this.onEndEdit?.(),
    notifyNotesChanged: () => this.onNotesChanged?.(),
    requestSeek: (tick) => this.onSeekRequest?.(tick),
    invalidateTempoCache: () => {
      this.tempoCacheMidi = null;
    },
    rollbackEdit: () => this.onRollbackEdit?.() ?? false,
    promptLyric: (tick, handlers) => this.header.promptText(tick, handlers),
    cancelLyricPrompt: () => this.header.cancelPrompt(),
    editNextLyric: (afterTick) => this.editNextLyric(afterTick),
    previewNotes: (notes) => this.onNotePreview?.(notes),
  };

  /** Applies note gestures and clipboard operations to the document. */
  private readonly editing = new NoteEditingController(
    this.context,
    this.coordinates,
  );

  /** Tempo, time signature and text markers above the grid. */
  private readonly header = new HeaderController(
    this.context,
    this.coordinates,
  );

  /** Text labels in the keyboard gutter. */
  private readonly labels = new PianoRollLabels(
    this.context,
    this.coordinates,
    this.header,
  );

  /** Draws the grid, notes and keyboard into the Three scene. */
  private readonly renderer = new PianoRollRenderer(
    this.context,
    this.coordinates,
    this.noteData,
    this.geometry,
    this.header,
  );

  /** Pointer and keyboard input on the canvas. */
  private readonly input = new PianoRollInputController(
    this.context,
    this.coordinates,
    this.geometry,
    this.editing,
    this.header,
  );

  /** Document the tempo and time signature caches were read from. */
  private tempoCacheMidi: Midi | null = null;

  /** Tempo changes of the current document. */
  private tempoEvents: TempoEvent[] = createDefaultTempoEvents();

  /** Time signature changes of the current document. */
  private timeSignatureEvents: TimeSignatureEvent[] =
    createDefaultTimeSignatureEvents();

  /** Canvas the view draws into; null until mounted. */
  private canvas: HTMLCanvasElement | null = null;

  /** Tick the playhead is drawn at. */
  private playheadTick = 0;

  /** Canvas width at the last draw. */
  private lastWidth = 1;

  /** Canvas height at the last draw. */
  private lastHeight = 1;

  /** The active instrument profile. */
  public getProfile(): PianoRollProfile {
    return this.profile;
  }

  /**
   * Switches pitch range, pinned lanes, editing and header behaviour without
   * rebuilding the renderer (which would reset the camera), mirroring
   * HighwayView.setMode().
   */
  public setProfile(profile: PianoRollProfile): void {
    if (profile === this.profile) return;

    // Abandon gestures and remember this profile's camera before leaving it.
    this.input.cancelNoteEditing();
    this.profileCameras.set(this.profile.id, {
      y: this.camera.y,
      v: this.camera.v,
    });

    // Drop everything derived from the previous profile.
    this.profile = profile;
    this.selection.clear();
    this.geometry.clear();
    this.noteData.clear();
    this.vocalMarksKey = null;

    this.restoreProfileCamera(profile);
    this.render();
  }

  /** Sets what a vocal drag in the grid creates. */
  public setVocalPlacement(placement: VocalPlacement): void {
    this.vocalPlacement = placement;
  }

  /** Sets the header lanes to render; all lanes are shown by default. */
  public setHeaderLanes(lanes: readonly HeaderLane[]): void {
    this.header.setVisibleLanes(lanes);
  }

  /** Fits the profile's pitch range (C2-C6 for vocals) into the viewport. */
  public fitPitchRange(): void {
    // Without a canvas size there is nothing to fit yet; retry on first draw.
    if (this.lastHeight <= 1) {
      this.pendingRangeFit = true;
      return;
    }

    this.pendingRangeFit = false;
    this.coordinates.fitPitchRange(this.lastHeight);
    this.render();
  }

  /** The camera, in the form that is persisted with the viewport. */
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
    if (!isPianoRollCameraState(state) || state.profile !== this.profile.id) {
      return false;
    }

    this.pendingRangeFit = false;
    this.camera.v = state.v;
    this.camera.h = state.h;
    this.camera.y = this.coordinates.clampCameraY(state.y);
    this.render();
    return true;
  }

  /** State of the pointer gesture in progress. */
  public getPointerContext(): PointerContext {
    return this.pointer;
  }

  /** The selected notes and marquee. */
  public getSelectionContext(): SelectionContext {
    return this.selection;
  }

  /** Applies new view state, cancelling note editing when playback starts. */
  public override update(state: ChartViewState): void {
    const playbackStarted = !this.state.isPlaying && state.isPlaying;
    super.update(state);

    if (playbackStarted) this.input.cancelNoteEditing();
  }

  /** Tick at the left edge of the viewport. */
  public override getCameraTick(): number {
    return this.camera.x;
  }

  /** Number of ticks across the viewport. */
  public override getVisibleTickSpan(): number {
    return this.coordinates.getVisibleTickSpan(this.lastWidth);
  }

  /** Scrolls so `tick` is at the left edge of the viewport. */
  public override setCameraTick(tick: number): void {
    this.coordinates.setCameraTick(tick);
    this.render();
  }

  /** Moves the drawn playhead to `tick`. */
  public override setPlayheadTick(tick: number): void {
    this.playheadTick = tick;
    this.render();
  }

  /** Mounts the canvas, then the header and labels on top of it. */
  public override async mount(host: HTMLElement): Promise<void> {
    await super.mount(host);
    if (!this.canvas) return;

    this.header.mount(host);
    this.labels.mount(host);
  }

  /** Detaches input, DOM and GPU resources. */
  public override destroy(): void {
    this.input.detach();
    this.header.destroy();
    this.labels.destroy();
    this.canvas = null;
    this.geometry.clear();
    this.noteData.clear();
    this.renderer.dispose();
    super.destroy();
  }

  /** The piano-roll notes of one track. */
  public override getTrackNotes(
    midi: Midi,
    trackIndex: number,
  ): PianoRollNote[] {
    return this.noteData.getTrackNotes(midi, trackIndex);
  }

  /** Zooms and scrolls so the selected notes fill the viewport. */
  public focusSelection(): void {
    this.coordinates.focusSelection(
      this.selection.notes,
      this.lastWidth,
      this.lastHeight,
    );
    this.render();
  }

  /** True when there is a selection to copy. */
  public canCopySelection(): boolean {
    return this.editing.canCopySelection();
  }

  /** True when the selection can be cut. */
  public canCutSelection(): boolean {
    return this.editing.canCutSelection();
  }

  /** True when the clipboard can be pasted. */
  public canPasteClipboard(): boolean {
    return this.editing.canPasteClipboard();
  }

  /** Copies the selected notes. */
  public copySelection(): void {
    this.editing.copySelection();
  }

  /** Cuts the selected notes. */
  public cutSelection(): void {
    this.editing.cutSelection();
  }

  /** Pastes the clipboard at the pointer. */
  public pasteClipboard(): void {
    this.input.pasteClipboard();
  }

  /** Draws the playhead without redrawing the whole scene. */
  public drawCursor(width: number, height: number): void {
    this.renderer.drawCursor(width, height, this.playheadTick);
  }

  /** The Three scene the base class renders. */
  protected override get renderScene(): THREE.Scene {
    return this.renderer.scene;
  }

  /** The Three camera the base class renders with. */
  protected override get renderCamera(): THREE.Camera {
    return this.threeCamera;
  }

  /** Attaches input to the engine's canvas once the engine exists. */
  protected override onMounted(engine: Engine): void {
    this.canvas = engine.canvas;
    this.input.attach(this.canvas);
    this.threeCamera.rotation.set(0, 0, 0);
  }

  /** Draws one frame: sizes the cameras, updates caches, draws, then notifies. */
  protected override draw(engine: Engine): void {
    const { width, height } = engine.size;
    this.lastWidth = width;
    this.lastHeight = height;

    this.fitThreeCameraToCanvas(width, height);
    this.input.setViewport(width, height);

    this.updateTempoCache();
    this.applyPendingRangeFit(height);
    this.camera.y = this.coordinates.clampCameraY(this.camera.y);

    this.renderer.draw(width, height, this.playheadTick);
    this.labels.draw(height);

    // NOTE: `camera` is mutated in place and `lastCamera` is always a copy, so
    // this reference comparison is always true and listeners hear about every
    // draw, not only about real camera changes.
    if (this.camera !== this.lastCamera) {
      this.lastCamera = { ...this.camera };
      this.notifyCameraChange();
    }
  }

  /** Converts screen-space values (point or rect) using the roll's camera. */
  protected override toScreenSpace(value: THREE.Vector2): THREE.Vector2;
  protected override toScreenSpace(value: THREE.Box2): THREE.Box2;
  protected override toScreenSpace(
    value: THREE.Vector2 | THREE.Box2,
  ): THREE.Vector2 | THREE.Box2 {
    return this.coordinates.toScreenSpace(value);
  }

  /** Brings back the camera a profile had, or its starting camera. */
  private restoreProfileCamera(profile: PianoRollProfile): void {
    const saved = this.profileCameras.get(profile.id);

    // A first visit to the vocals profile shows its whole range.
    if (!saved && profile.id === "vocals") {
      this.fitPitchRange();
      return;
    }

    // Zoom first: clamping the pitch depends on the vertical zoom.
    const { y, v } = saved ?? DefaultCamera;
    this.camera.v = v;
    this.camera.y = this.coordinates.clampCameraY(y);
  }

  /** Makes the orthographic camera map one unit to one canvas pixel. */
  private fitThreeCameraToCanvas(width: number, height: number): void {
    this.threeCamera.left = 0;
    this.threeCamera.right = width;
    this.threeCamera.top = 0;
    this.threeCamera.bottom = height;
    this.threeCamera.position.set(0, 0, 10);
    this.threeCamera.updateProjectionMatrix();
  }

  /** Runs a pitch-range fit that was requested before the canvas had a size. */
  private applyPendingRangeFit(height: number): void {
    if (!this.pendingRangeFit || height <= 1) return;

    this.pendingRangeFit = false;
    this.coordinates.fitPitchRange(height);
  }

  /** The track being edited, falling back to the profile's named track. */
  private getSelectedTrack(): MidiTrack | null {
    const midi = this.state.midi;
    if (!midi) {
      return null;
    }

    // First attempt to get the current track by index
    const trackIndex = this.state.selectedTrackIndex;
    if (trackIndex !== null) {
      const track = midi.tracks[trackIndex];
      return track ?? null;
    }

    // If that fails, get the current track by key
    const trackKey = this.state.selectedTrackKey;
    if (trackKey !== null) {
      const view = new SongView(midi);
      const track = view.getMidiTrack(trackKey) ?? null;
      return track || null;
    }

    return null;
  }

  /** Index of the edited track in the MIDI file, or null when there is none. */
  private getSelectedTrackIndex(): number | null {
    const midi = this.state.midi;
    const track = this.getSelectedTrack();
    if (!midi || !track) {
      return null;
    }

    const index = midi.tracks.indexOf(track);
    return index >= 0 ? index : null;
  }

  private getSelectedTrackKey(): string | null {
    const midi = this.state.midi;
    const track = this.getSelectedTrack();
    if (!midi || !track) {
      return null;
    }
    return track.name;
  }

  /** The text events the header's text lane shows for the edited track. */
  private getHeaderTextEvents(): TextEvent[] {
    const events = this.getSelectedTrack()?.getTextEvents() ?? [];
    if (this.profile.header.textLane !== "lyrics") return events;

    return events.filter((event) => event.type === MetaType.Lyric);
  }

  /** Missing-lyric marks, recomputed only when the track's revision moves. */
  private getVocalMarks(): VocalMarks {
    const layout = this.profile.vocal;
    const track = this.getSelectedTrack();
    if (!layout || !track) return EMPTY_MARKS;

    const revision = track.getNoteRevision();
    const isCurrent =
      this.vocalMarksKey?.track === track &&
      this.vocalMarksKey.revision === revision;
    if (isCurrent) return this.vocalMarks;

    this.vocalMarks = collectVocalMarks(track, layout);
    this.vocalMarksKey = { track, revision };
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

    const next = getVocalNotes(track, layout)
      .filter((item) => vocalKindNeedsLyric(item.kind))
      .find((item) => item.note.start > afterTick);
    if (!next) return;

    this.scrollTickIntoView(next.note.start);

    // Edit an existing lyric in place; otherwise ask for a new one.
    if (next.lyric) {
      this.header.editTextAt(next.note.start);
    } else {
      this.promptForLyric(track, layout, next.note);
    }

    this.render();
  }

  /** Scrolls horizontally if `tick` is off screen or too near the right edge. */
  private scrollTickIntoView(tick: number): void {
    const x = this.coordinates.screenXForTick(tick);
    const rightLimit = this.lastWidth - LyricScrollMarginPixels;
    const isVisible = x >= KeyboardWidth && x <= rightLimit;
    if (isVisible) return;

    this.coordinates.setCameraTick(
      tick - this.getVisibleTickSpan() * LyricScrollLeadRatio,
    );
  }

  /** Prompts for a note's missing lyric; Tab saves it and moves to the next. */
  private promptForLyric(
    track: MidiTrack,
    layout: VocalLayout,
    note: MidiNote,
  ): void {
    const writeLyric = (text: string): boolean => {
      const written = setVocalLyric(track, layout, note, text);
      if (written) this.onNotesChanged?.();
      return written;
    };

    this.header.promptText(note.start, {
      onCommit: writeLyric,
      onCancel: () => {},
      onTab: (text) => {
        if (writeLyric(text)) this.editNextLyric(note.start);
      },
    });
  }

  /** Re-reads tempo and time signature events when the document changed. */
  private updateTempoCache(): void {
    const midi = this.state.midi;
    if (midi === this.tempoCacheMidi) return;

    this.tempoCacheMidi = midi;
    this.tempoEvents = midi?.getTempoEvents() ?? createDefaultTempoEvents();
    this.timeSignatureEvents =
      midi?.getTimeSignatureEvents() ?? createDefaultTimeSignatureEvents();
  }
}

export type { PianoRollNote } from "./types";
export {
  DefaultProfile as DEFAULT_PROFILE,
  profileForInstrument,
} from "./profile";
export type { PianoRollProfile } from "./profile";
export type { VocalPlacement } from "./types";
