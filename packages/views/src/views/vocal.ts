import { MidiTrack, MidiNote, type TextMidiEvent } from "@openchart/midi";
import type { MidiNotePhrase } from "../chartEditing.js";
import { SongView } from "../chartView.js";
import { InstrumentTrackViewConfig } from "../config.js";
import {
  type VocalLayout,
  vocalLayoutFromConfig,
  type VocalClassification,
  classifyVocalPitch,
  type VocalNoteKind,
  type VocalNote,
  getVocalNotes,
  findVocalNote,
  type VocalPhraseKind,
  getVocalPhrases,
  type TimedLyric,
  getLyrics,
  type AddVocalNoteOptions,
  addVocalNote,
  type VocalMove,
  moveVocalNotes,
  removeVocalNotes,
  setVocalLyric,
  addVocalPhrase,
  updateVocalPhrase,
  type VocalValidationOptions,
  type VocalIssue,
  validateVocalTrack,
  type VocalRepairOptions,
  repairVocalTrack,
} from "../vocals.js";
import { InstrumentTrackView } from "./instrument.js";

/**
 * Kind-aware view of a VOCALS track: pitched, pitchless and percussion notes,
 * vocal / power-window / stagepower phrases, and the Lyric events that sit on
 * each pitched or pitchless note's tick. The MIDI track is created lazily on
 * the first edit, like ChartView.
 */

export class VocalTrackView extends InstrumentTrackView {
  private readonly layout: VocalLayout;

  constructor(
    song: SongView,
    midiTrack: MidiTrack | undefined,
    config: InstrumentTrackViewConfig,
  ) {
    super(song, midiTrack, config);
    this.layout = vocalLayoutFromConfig(config);
  }

  public getLayout(): VocalLayout {
    return this.layout;
  }

  public classify(pitch: number): VocalClassification {
    return classifyVocalPitch(this.layout, pitch);
  }

  public getNoteRevision(): number {
    return this.track?.getNoteRevision() ?? 0;
  }

  /** Notes of every kind (or one kind), each with its paired lyric. */
  public getNotes(kind?: VocalNoteKind): VocalNote[] {
    return getVocalNotes(this.track, this.layout, kind);
  }

  public getVocalNote(note: MidiNote): VocalNote | null {
    return findVocalNote(this.track, this.layout, note);
  }

  public getPhrases(kind: VocalPhraseKind): MidiNotePhrase[] {
    return getVocalPhrases(this.track, this.layout, kind);
  }

  public getLyrics(): TimedLyric[] {
    return getLyrics(this.track);
  }

  public getLyricFor(note: MidiNote): TextMidiEvent | null {
    return this.getVocalNote(note)?.lyric ?? null;
  }

  /** Materializes the VOCALS MIDI track for an intentional edit. */
  public ensureTrack(): MidiTrack | undefined {
    this.track ??= this.song.ensureMidiTrack(this.getKey());
    if (this.track) this.song.attachTrack(this.track);
    return this.track;
  }

  public addNote(
    kind: VocalNoteKind,
    start: number,
    end: number,
    options: AddVocalNoteOptions = {},
  ): VocalNote | null {
    const track = this.ensureTrack();
    return track
      ? addVocalNote(track, this.layout, kind, start, end, options)
      : null;
  }

  public addPitched(
    pitch: number,
    start: number,
    end: number,
    lyric?: string,
  ): VocalNote | null {
    return this.addNote("pitched", start, end, { pitch, lyric });
  }

  public addPercussion(start: number, end: number): VocalNote | null {
    return this.addNote("percussion", start, end);
  }

  /** `pitch` picks pitchless 85 or 35; defaults to the configured placement. */
  public addPitchless(
    start: number,
    end: number,
    lyric?: string,
    pitch?: number,
  ): VocalNote | null {
    return this.addNote("pitchless", start, end, { lyric, pitch });
  }

  public moveNotes(moves: readonly VocalMove[]): boolean {
    return this.track ? moveVocalNotes(this.track, this.layout, moves) : false;
  }

  public setNoteEnd(note: MidiNote, end: number): boolean {
    if (!this.track || !Number.isInteger(end) || end <= note.start) {
      return false;
    }
    return this.track.setNoteDuration(note, end - note.start);
  }

  public removeNotes(notes: readonly MidiNote[]): boolean {
    return this.track
      ? removeVocalNotes(this.track, this.layout, notes)
      : false;
  }

  public setLyric(note: MidiNote, text: string): boolean {
    return this.track
      ? setVocalLyric(this.track, this.layout, note, text)
      : false;
  }

  public addPhrase(
    kind: VocalPhraseKind,
    start: number,
    end: number,
  ): MidiNotePhrase | null {
    const track = this.ensureTrack();
    return track ? addVocalPhrase(track, this.layout, kind, start, end) : null;
  }

  public updatePhrase(note: MidiNote, start: number, end: number): boolean {
    return this.track ? updateVocalPhrase(this.track, note, start, end) : false;
  }

  public removePhrase(note: MidiNote): boolean {
    return this.track?.removeNote(note.noteOn, note.noteOff) ?? false;
  }

  public validate(options?: VocalValidationOptions): VocalIssue[] {
    return validateVocalTrack(this.track, this.layout, options);
  }

  public repair(options?: VocalRepairOptions): number {
    return this.track ? repairVocalTrack(this.track, this.layout, options) : 0;
  }
}
