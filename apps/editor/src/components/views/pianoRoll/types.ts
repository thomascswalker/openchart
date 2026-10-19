import type {
  Midi,
  MidiChannelEvent,
  MidiNote,
  MidiTrack,
  TextEvent,
  TempoEvent,
  TimeSignatureEvent,
} from "@openchart/core";
import type { VocalNoteKind, VocalPhraseKind } from "@openchart/views";
import type { ChartViewState } from "../AbstractChartView";
import type { PianoRollProfile } from "./profile";
import type { SelectionContext } from "./selection";
import type { PointerContext } from "./pointer";

/** A MIDI note flattened into the units the piano roll works with. */
export interface PianoRollNote {
  /** Absolute tick at which the note starts. */
  tick: number;

  /** Length of the note in ticks. */
  durationTicks: number;

  /** MIDI pitch number. */
  pitch: number;

  /** MIDI note-on velocity. */
  velocity: number;

  /** Back-reference to the source note, used to keep selection stable across edits. */
  midiNote: MidiNote;
}

/** A horizontal strip of the canvas, in screen pixels. */
export interface ScreenBand {
  /** Screen Y of the strip's top edge. */
  y: number;

  /** Height of the strip. */
  height: number;
}

/** Position and zoom of the viewport onto the note grid. */
export interface PianoRollCamera {
  /**
   * Absolute MIDI tick at the left edge of the note viewport.
   */
  x: number;

  /**
   * MIDI pitch at the top edge of the viewport.
   *
   * This is a float so vertical panning can be smooth.
   */
  y: number;

  /**
   * Horizontal zoom.
   */
  h: number;

  /**
   * Vertical zoom.
   */
  v: number;
}

/** Toolbar state that decides what a vocal drag in the grid creates. */
export interface VocalPlacement {
  /** Kind of note a grid drag creates when no phrase is selected. */
  noteKind: VocalNoteKind;

  /** When set, a grid drag creates this phrase instead of a note. */
  phrase: VocalPhraseKind | null;
}

/** Derived vocal validation state used for drawing, cached per revision. */
export interface VocalMarks {
  /** NoteOn events of pitched/pitchless notes with no lyric on their tick. */
  missingLyric: ReadonlySet<MidiChannelEvent>;

  /** Ticks of those notes, for the header's validation markers. */
  missingTicks: readonly number[];
}

/** Callbacks for the header's inline lyric prompt. */
export interface LyricPromptHandlers {
  /** Text the prompt opens with; empty when omitted. */
  initialText?: string;

  /** Return false to keep the prompt open (e.g. empty text). */
  onCommit(text: string): boolean;

  /** Called when the prompt is dismissed without committing. */
  onCancel(): void;

  /** Tab: commit and move on. Falls back to onCommit when omitted. */
  onTab?(text: string): void;
}

/** The narrow dependency surface shared by the piano-roll controllers. */
export interface PianoRollContext {
  /** Current chart view state (document, selection, snap, playback). */
  getState(): ChartViewState;

  /** The loaded MIDI document, if any. */
  getMidi(): Midi | null;

  /** Ticks per quarter note of the loaded document. */
  getPpqn(): number;

  /** Track being edited, or null when there is none. */
  getSelectedTrack(): MidiTrack | null;

  /** Index of getSelectedTrack() in the MIDI file */
  getSelectedTrackIndex(): number | null;

  /** Key of getSelectedTrack() in the MIDI file */
  getSelectedTrackKey(): string | null;

  /** Profile for the current instrument. */
  getProfile(): PianoRollProfile;

  /** Toolbar choice of what a vocal drag creates. */
  getVocalPlacement(): VocalPlacement;

  /** Missing-lyric validation marks for the selected vocal track. */
  getVocalMarks(): VocalMarks;

  /** Piano-roll notes of one track, cached until the track changes. */
  getTrackNotes(midi: Midi, trackIndex: number): PianoRollNote[];

  /** Notes of the track most recently mapped by getTrackNotes. */
  getCurrentNotes(): PianoRollNote[];

  /** Tempo changes of the document, ordered by tick. */
  getTempoEvents(): TempoEvent[];

  /** Time signature changes of the document, ordered by tick. */
  getTimeSignatureEvents(): TimeSignatureEvent[];

  /** Text events the header's text lane shows for the selected track. */
  getTextEvents(): TextEvent[];

  /** Live camera; mutated by pan and zoom. */
  getCamera(): PianoRollCamera;

  /** Size of the canvas in pixels. */
  getViewport(): { width: number; height: number };

  /** State of the pointer gesture in progress. */
  getPointerContext(): PointerContext;

  /** Note selection and marquee. */
  getSelectionContext(): SelectionContext;

  /** Schedules a redraw. */
  requestRender(): void;

  /** Opens an undo transaction. */
  beginEdit(): void;

  /** Closes the open undo transaction. */
  endEdit(): void;

  /** Tells the host the document changed. */
  notifyNotesChanged(): void;

  /** Moves the playback cursor to `tick`. */
  requestSeek(tick: number): void;

  /** Forces tempo and time signature events to be re-read from the document. */
  invalidateTempoCache(): void;

  /** Restores the document to before the open edit transaction. */
  rollbackEdit(): boolean;

  /** Opens the inline lyric prompt at `tick`. */
  promptLyric(tick: number, handlers: LyricPromptHandlers): void;

  /** Closes the inline lyric prompt, running its cancel handler. */
  cancelLyricPrompt(): void;

  /** Tab from a lyric: edit (or prompt for) the next note's lyric. */
  editNextLyric(afterTick: number): void;

  /** Audition notes (vocal pitch feedback on place/move). */
  previewNotes(notes: readonly PianoRollNote[]): void;
}
