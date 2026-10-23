import {
  MetaType,
  type Midi,
  type MidiChannelEvent,
  type MidiTrack,
  type TempoEvent,
  type TimeSignatureEvent,
} from "@openchart/midi";
import {
  getVocalNotes,
  setVocalLyric,
  validateVocalTrack,
  vocalKindNeedsLyric,
} from "@openchart/views";
import { Box2, Vector2 } from "three";
import * as THREE from "three";
import { AbstractChartView, type ChartViewState } from "../AbstractChartView";
import { type Engine, type EngineOptions } from "../../../rendering/engine";
import { CoordinateSystem } from "./coordinates";
import { HeaderController, type HeaderLane } from "./controllers/header";
import { PianoRollInputController } from "./controllers/input";
import { PianoRollLabels } from "./controllers/labels";
import { NoteDataStore } from "./noteData";
import { NoteEditingController } from "./controllers/noteEditing";
import { NoteGeometryCache } from "./noteGeometry";
import { PointerContext } from "./pointer";
import { GENERIC_PROFILE, type PianoRollProfile } from "./profile";
import { PianoRollRenderer } from "./rendering";
import { SelectionContext } from "./selection";
import type {
  PianoRollCamera,
  PianoRollCameraState,
  PianoRollContext,
  PianoRollNote,
  VocalMarks,
  VocalPlacement,
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
  private vocalPlacement: VocalPlacement = {
    noteKind: "pitched",
    phrase: null,
  };
  private vocalMarksKey: { track: MidiTrack; revision: number } | null = null;
  private vocalMarks: VocalMarks = EmptyMarks;

  /** Audition hook for vocal pitch feedback on place/move. */
  public onNotePreview: ((notes: readonly PianoRollNote[]) => void) | null =
    null;

  private readonly pointer = new PointerContext();
  private readonly selection = new SelectionContext();

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
    requestRender: () => this.render(),
    beginEdit: () => this.onBeginEdit?.(),
    endEdit: () => this.onEndEdit?.(),
    notifyNotesChanged: () => this.onNotesChanged?.(),
    requestSeek: (tick) => this.onSeekRequest?.(tick),
    invalidateTempoCache: () => {
      this.#tempoCacheMidi = null;
    },
    rollbackEdit: () => this.onRollbackEdit?.() ?? false,
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
  public setProfile(profile: PianoRollProfile): void {
    if (profile === this.profile) return;
    this.input.cancelNoteEditing();
    this.profileCameras.set(this.profile.id, {
      y: this.camera.y,
      v: this.camera.v,
    });
    this.profile = profile;
    this.selection.clear();
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

  public setVocalPlacement(placement: VocalPlacement): void {
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

  public getPointerContext(): PointerContext {
    return this.pointer;
  }

  public getSelectionContext(): SelectionContext {
    return this.selection;
  }

  public override update(state: ChartViewState): void {
    const playbackStarted = !this.state.isPlaying && state.isPlaying;
    super.update(state);
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
    this.header.destroy();
    this.labels.destroy();
    this.#canvas = null;
    this.geometry.clear();
    this.noteData.clear();
    this.renderer.dispose();
    super.destroy();
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

  public canCopySelection(): boolean {
    return this.editing.canCopySelection();
  }

  public canCutSelection(): boolean {
    return this.editing.canCutSelection();
  }

  public canPasteClipboard(): boolean {
    return this.editing.canPasteClipboard();
  }

  public copySelection(): void {
    this.editing.copySelection();
  }

  public cutSelection(): void {
    this.editing.cutSelection();
  }

  public pasteClipboard(): void {
    this.input.pasteClipboard();
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
    const trackIndex = this.state.selectedTrackIndex;
    if (trackIndex !== null) return midi.tracks[trackIndex] ?? null;
    // A configured track may be created mid-gesture before the viewport has
    // re-resolved selectedTrackIndex.
    const trackName = this.profile.trackName ?? this.state.selectedInstrument;
    return trackName ? (midi.getTrack(trackName) ?? null) : null;
  }

  private getSelectedTrackIndex(): number | null {
    const midi = this.state.midi;
    const track = this.getSelectedTrack();
    if (!midi || !track) {
      return null;
    }
    const index = midi.tracks.indexOf(track);
    return index >= 0 ? index : null;
  }

  /** Missing-lyric marks, recomputed only when the track's revision moves. */
  private getVocalMarks(): VocalMarks {
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
    for (const issue of validateVocalTrack(track, layout)) {
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
    const next = getVocalNotes(track, layout)
      .filter((item) => vocalKindNeedsLyric(item.kind))
      .find((item) => item.note.start > afterTick);
    if (!next) return;

    const x = this.coordinates.screenXForTick(next.note.start);
    if (x < KeyboardWidth || x > this.#lastViewportSize.x - 80) {
      this.coordinates.setCameraTick(
        next.note.start - this.getVisibleTickSpan() / 4,
      );
    }
    const tick = next.note.start;
    if (next.lyric) {
      this.header.editTextAt(tick);
    } else {
      const write = (text: string): boolean => {
        const ok = setVocalLyric(track, layout, next.note, text);
        if (ok) this.onNotesChanged?.();
        return ok;
      };
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
}

export type { PianoRollNote } from "./types";

function isPianoRollCameraState(value: unknown): value is PianoRollCameraState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return (
    (state.profile === "generic" || state.profile === "vocals") &&
    [state.y, state.v, state.h].every(
      (item) => typeof item === "number" && Number.isFinite(item),
    )
  );
}

export { GENERIC_PROFILE, profileForInstrument } from "./profile";
export type { PianoRollProfile } from "./profile";
export type { VocalPlacement } from "./types";
