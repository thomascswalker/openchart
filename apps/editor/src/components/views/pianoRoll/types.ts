import type {
  Midi,
  MidiChannelEvent,
  MidiNote,
  MidiTrack,
  TextMidiEvent,
  TempoEvent,
  TimeSignatureEvent,
} from "@openchart/midi";
import type {
  ChartDocument,
  ChartEditAction,
  ClipboardService,
  EditingSession,
  EditScratchpad,
  SelectionModel,
  VocalNoteKind,
  VocalPhraseKind,
} from "@openchart/views";
import type { ChartViewState } from "../AbstractChartView";
import type { PianoRollProfile } from "./profile";
import type { SelectionContext } from "./selection";
import type { PointerContext } from "./input/pointer";

export interface PianoRollNote {
  tick: number;
  durationTicks: number;
  pitch: number;
  velocity: number;
  midiNote: MidiNote;
}

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
export interface PianoRollVocalPlacement {
  noteKind: VocalNoteKind;
  /** When set, a grid drag creates this phrase instead of a note. */
  phrase: VocalPhraseKind | null;
}

/** Derived vocal validation state used for drawing, cached per revision. */
export interface PianoRollVocalMarks {
  /** NoteOn events of pitched/pitchless notes with no lyric on their tick. */
  missingLyric: ReadonlySet<MidiChannelEvent>;
  /** Ticks of those notes, for the header's validation markers. */
  missingTicks: readonly number[];
}

/** Callbacks for the header's inline lyric prompt. */
export interface PianoRollLyricPromptHandlers {
  initialText?: string;
  /** Return false to keep the prompt open (e.g. empty text). */
  onCommit(text: string): boolean;
  onCancel(): void;
  /** Tab: commit and move on. Falls back to onCommit when omitted. */
  onTab?(text: string): void;
}

/** The narrow dependency surface shared by the piano-roll controllers. */
export interface PianoRollContext {
  getState(): ChartViewState;
  getMidi(): Midi | null;
  getPpqn(): number;
  getSelectedTrack(): MidiTrack | null;
  /** Index of getSelectedTrack() in the MIDI file (resolved by name if new). */
  getSelectedTrackIndex(): number | null;
  getProfile(): PianoRollProfile;
  getVocalPlacement(): PianoRollVocalPlacement;
  getVocalMarks(): PianoRollVocalMarks;
  getTrackNotes(midi: Midi, trackIndex: number): PianoRollNote[];
  getCurrentNotes(): PianoRollNote[];
  getTempoEvents(): TempoEvent[];
  getTimeSignatureEvents(): TimeSignatureEvent[];
  getTextEvents(): TextMidiEvent[];
  getCamera(): PianoRollCamera;
  getViewport(): { width: number; height: number };
  getPointerContext(): PointerContext;
  getSelectionContext(): SelectionContext;
  getEditingCore?(): PianoRollEditingCore | null;
  getEditingSession?(): EditingSession | null;
  getDisplayNotes?(notes: PianoRollNote[]): PianoRollNote[];
  requestRender(): void;
  beginEdit(): void;
  endEdit(): void;
  notifyNotesChanged(): void;
  requestSeek(tick: number): void;
  invalidateTempoCache(): void;
  /** Restores the document to before the open edit transaction. */
  rollbackEdit(): boolean;
  promptLyric(tick: number, handlers: PianoRollLyricPromptHandlers): void;
  cancelLyricPrompt(): void;
  /** Tab from a lyric: edit (or prompt for) the next note's lyric. */
  editNextLyric(afterTick: number): void;
  /** Audition notes (vocal pitch feedback on place/move). */
  previewNotes(notes: readonly PianoRollNote[]): void;
}

export interface PianoRollEditingCore {
  readonly selection: SelectionModel;
  readonly scratchpad: EditScratchpad;
  readonly clipboard: ClipboardService;
  getDocument(): ChartDocument;
  getSession(viewportId: string): EditingSession | null;
  dispatch(action: ChartEditAction): boolean;
  dispatchBatch(actions: ChartEditAction[]): boolean;
}

export interface PianoRollCameraState {
  profile: PianoRollProfile["id"];
  y: number;
  v: number;
  h: number;
}
