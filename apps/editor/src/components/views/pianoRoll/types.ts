import type {
  Midi,
  MidiNote,
  MidiTrack,
  TimedMidiEvent,
  TextMidiEvent,
  TempoChange,
  TimeSignatureChange,
} from "@midiedit/core";
import type { ChartViewState } from "../AbstractChartView";
import type { SelectionContext } from "./selection";
import type { PointerContext } from "./pointer";

export interface PianoRollNote {
  tick: number;
  durationTicks: number;
  pitch: number;
  velocity: number;
  /** Back-reference to the source note, used to keep selection stable across edits. */
  midiNote: MidiNote;
}

export interface ActiveNote {
  tick: number;
  velocity: number;
}

export type PianoRollTextEvent = TimedMidiEvent & { event: TextMidiEvent };

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

/** The narrow dependency surface shared by the piano-roll controllers. */
export interface PianoRollContext {
  getState(): ChartViewState;
  getMidi(): Midi | null;
  getPpqn(): number;
  getSelectedTrack(): MidiTrack | null;
  getTrackNotes(midi: Midi, trackIndex: number): PianoRollNote[];
  getCurrentNotes(): PianoRollNote[];
  getTempoChanges(): TempoChange[];
  getTimeSignatureChanges(): TimeSignatureChange[];
  getTextEvents(): PianoRollTextEvent[];
  getCamera(): PianoRollCamera;
  getKeyboardWidth(): number;
  getViewport(): { width: number; height: number };
  getPointerContext(): PointerContext;
  getSelectionContext(): SelectionContext;
  requestRender(): void;
  beginEdit(): void;
  endEdit(): void;
  notifyNotesChanged(): void;
  requestSeek(tick: number): void;
  invalidateTempoCache(): void;
}
