import {
  MetaType,
  Midi,
  MidiNote,
  MidiTrack,
  type TextEvent,
} from "@openchart/core";
import type { MidiNotePhrase } from "./chartEditing.js";
import {
  defaultConfig,
  describeTrack,
  hasDifficulties,
  InstrumentTrackViewConfig,
  isVocalTrackConfig,
  SongViewConfig,
  TrackDescriptor,
  TrackViewConfig,
} from "./config.js";
import {
  addVocalNote,
  addVocalPhrase,
  classifyVocalPitch,
  findVocalNote,
  getLyrics,
  getVocalNotes,
  getVocalPhrases,
  moveVocalNotes,
  removeVocalNotes,
  repairVocalTrack,
  setVocalLyric,
  updateVocalPhrase,
  validateVocalTrack,
  vocalLayoutFromConfig,
  type AddVocalNoteOptions,
  type TimedLyric,
  type VocalClassification,
  type VocalIssue,
  type VocalLayout,
  type VocalMove,
  type VocalNote,
  type VocalNoteKind,
  type VocalPhraseKind,
  type VocalRepairOptions,
  type VocalValidationOptions,
} from "./vocals.js";

type Instrument =
  | "LEAD GUITAR"
  | "RHYTHM GUITAR"
  | "FOUR PAD"
  | "FIVE PAD"
  | "BASS"
  | "DRUMS"
  | "VOCALS"
  | "HARMONIES"
  | "SYNTH"
  | "OTHER";
enum InstrumentType {
  Lead = "LEAD GUITAR",
  Groove = "RHYTHM GUITAR",
  FourPad = "FOUR PAD",
  FivePad = "FIVE PAD",
  Bass = "BASS",
  Drums = "DRUMS",
  Vocals = "VOCALS",
  Harmonies = "HARMONIES",
  Synth = "SYNTH",
  Other = "OTHER",
}

enum Difficulty {
  Easy,
  Medium,
  Hard,
  Expert,
}

enum Note {
  Green = 0x0,
  Red = 0x1,
  Yellow = 0x2,
  Blue = 0x3,
  Orange = 0x4,
}

export class ChartView {
  private track: TrackView;
  private midiTrack: MidiTrack | undefined;
  private difficulty: Difficulty;
  private offset: number;
  private lanes: number;
  private role?: string;
  private cachedNoteTrack: MidiTrack | undefined;
  private cachedNoteRevision = -1;
  private cachedNotes: MidiNote[] = [];

  constructor(
    track: TrackView,
    midiTrack: MidiTrack | undefined,
    difficulty: Difficulty,
    offset: number,
    lanes: number,
    role?: string,
  ) {
    this.track = track;
    this.midiTrack = midiTrack;
    this.difficulty = difficulty;
    this.offset = offset;
    this.lanes = lanes;
    this.role = role;
  }

  public getTrack(): TrackView {
    return this.track;
  }

  public getSong(): SongView {
    return this.track.getSong();
  }

  public getDifficulty(): Difficulty {
    return this.difficulty;
  }

  public getOffset(): number {
    return this.offset;
  }

  public getLaneCount(): number {
    return this.lanes;
  }

  public getNoteRevision(): number {
    return this.midiTrack?.getNoteRevision() ?? 0;
  }

  public getNotes(): MidiNote[] {
    const revision = this.getNoteRevision();
    if (
      this.cachedNoteTrack === this.midiTrack &&
      this.cachedNoteRevision === revision
    ) {
      return this.cachedNotes;
    }

    const low = this.offset;
    const high = this.offset + this.lanes;
    const notes = this.midiTrack?.getNotes({ pitch: { low, high } }) ?? [];
    if (this.role === "drums" && this.difficulty === Difficulty.Expert) {
      const expertKick2 =
        this.midiTrack?.getNotes({ pitch: { low: 95, high: 96 } }) ?? [];
      for (const note of expertKick2) notes.push(note);
      notes.sort(
        (left, right) => left.start - right.start || left.note - right.note,
      );
    }

    this.cachedNoteTrack = this.midiTrack;
    this.cachedNoteRevision = revision;
    this.cachedNotes = notes;
    return this.cachedNotes;
  }

  public addNote(
    note: number,
    start: number,
    end: number = 0,
    velocity: number = 100,
  ): boolean {
    if (!Number.isInteger(note) || note < 0 || note >= this.lanes) {
      return false;
    }
    return this.addNoteAtPitch(this.offset + note, start, end, velocity);
  }

  public addNoteAtPitch(
    pitch: number,
    start: number,
    end: number = 0,
    velocity: number = 100,
  ): boolean {
    if (
      !this.containsPitch(pitch) ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      (end !== 0 && end < start)
    ) {
      return false;
    }

    this.midiTrack ??= this.getSong().ensureMidiTrack(this.track.getKey());
    if (!this.midiTrack) return false;
    this.getSong().attachTrack(this.midiTrack);
    const insertAt = this.midiTrack.getInsertionIndexAt(start);
    const previousTick = this.midiTrack.getAbsoluteTickAt(insertAt);
    const startDelta = start - previousTick;

    this.midiTrack.addNote(
      pitch,
      startDelta,
      velocity,
      Math.max(1, (end > start ? end : start + 1) - start),
      insertAt,
    );
    return true;
  }

  public removeNote(note: MidiNote): boolean {
    if (!this.midiTrack || !this.containsNote(note)) {
      return false;
    }

    this.getSong().attachTrack(this.midiTrack);
    return this.midiTrack.removeNote(note.noteOn, note.noteOff);
  }

  public moveNote(note: MidiNote, lane: number, start: number): boolean {
    if (
      !this.midiTrack ||
      !Number.isInteger(start) ||
      start < 0 ||
      !Number.isInteger(lane) ||
      lane < 0 ||
      lane >= this.lanes ||
      !this.containsNote(note)
    ) {
      return false;
    }

    this.getSong().attachTrack(this.midiTrack);
    return (
      this.midiTrack.setNoteStart(note, start) &&
      this.midiTrack.setNotePitch(note, this.offset + lane)
    );
  }

  public setNoteEnd(note: MidiNote, end: number): boolean {
    if (
      !this.midiTrack ||
      !Number.isInteger(end) ||
      end <= note.start ||
      !this.containsNote(note)
    ) {
      return false;
    }

    this.getSong().attachTrack(this.midiTrack);
    return this.midiTrack.setNoteDuration(note, end - note.start);
  }

  private containsNote(note: MidiNote): boolean {
    return this.containsPitch(note.note);
  }

  private containsPitch(pitch: number): boolean {
    return (
      (pitch >= this.offset && pitch < this.offset + this.lanes) ||
      (this.role === "drums" &&
        this.difficulty === Difficulty.Expert &&
        pitch === 95)
    );
  }
}

class TrackView {
  protected song: SongView;
  protected track: MidiTrack | undefined;
  protected validator: (track: MidiTrack) => boolean;

  constructor(
    song: SongView,
    midiTrack: MidiTrack | undefined,
    validator: (midiTrack: MidiTrack) => boolean = () => {
      return true;
    },
  ) {
    this.song = song;
    this.track = midiTrack;
    this.validator = validator;
  }

  public isValid(): boolean {
    return this.track !== undefined && this.validator(this.track);
  }

  public getSong(): SongView {
    return this.song;
  }

  public getKey(): string {
    return describeTrack({
      name: this.track?.name || "",
      type: "global",
      notes: {},
    }).key;
  }

  public getMidiTrack(): MidiTrack | undefined {
    return this.track;
  }
}

class GlobalTrackView extends TrackView {}

export class InstrumentTrackView extends TrackView {
  protected config: InstrumentTrackViewConfig;
  /** Absent for instruments without difficulties (vocals). */
  private readonly charts: Map<Difficulty, ChartView> | null;

  constructor(
    song: SongView,
    midiTrack: MidiTrack | undefined,
    config: InstrumentTrackViewConfig,
    validator: (midiTrack: MidiTrack) => boolean = () => {
      return true;
    },
  ) {
    super(song, midiTrack, validator);
    this.config = config;

    if (!hasDifficulties(config)) {
      this.charts = null;
      return;
    }

    const offsets: Record<Difficulty, number> = {
      [Difficulty.Expert]: config.offsets?.expert || 0,
      [Difficulty.Hard]: config.offsets?.hard || 0,
      [Difficulty.Medium]: config.offsets?.medium || 0,
      [Difficulty.Easy]: config.offsets?.easy || 0,
    };
    this.charts = new Map(
      [
        Difficulty.Expert,
        Difficulty.Hard,
        Difficulty.Medium,
        Difficulty.Easy,
      ].map((difficulty) => [
        difficulty,
        new ChartView(
          this,
          this.track,
          difficulty,
          offsets[difficulty],
          config.noteCount,
          config.role,
        ),
      ]),
    );
  }

  public getName(): string {
    return this.config.name;
  }

  public getConfig(): InstrumentTrackViewConfig {
    return this.config;
  }

  public override getKey(): string {
    return describeTrack(this.config).key;
  }

  public getMidiTrack(): MidiTrack | undefined {
    return this.track;
  }

  public hasDifficulties(): boolean {
    return this.charts !== null;
  }

  /** Undefined for instruments without difficulties. */
  public getChart(difficulty: Difficulty): ChartView | undefined {
    return this.charts?.get(difficulty);
  }

  /** Expert, Hard, Medium, Easy; empty for instruments without difficulties. */
  public getCharts(): ChartView[] {
    return this.charts ? [...this.charts.values()] : [];
  }
}

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

  public getLyricFor(note: MidiNote): TextEvent | null {
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

class SongView {
  private midi: Midi;
  private config: SongViewConfig;

  private instruments!: InstrumentTrackView[];
  private global!: GlobalTrackView;

  constructor(midi: Midi, config: SongViewConfig = defaultConfig) {
    this.midi = midi;
    this.config = config;
    this.sync();
  }

  public sync(): void {
    this.instruments = [];
    this.config.tracks.forEach((def: TrackViewConfig) => {
      const midiTrack = this.midi.getTrack(def.name);

      // Initialize the respective track view for the MIDI track
      switch (def.type) {
        case "global":
          this.global = new GlobalTrackView(this, midiTrack);
          break;
        case "instrument":
          this.instruments.push(
            isVocalTrackConfig(def)
              ? new VocalTrackView(this, midiTrack, def)
              : new InstrumentTrackView(
                  this,
                  midiTrack,
                  def as InstrumentTrackViewConfig,
                ),
          );
          break;
        default:
          console.error("Not implemented yet");
          break;
      }
    });
  }

  public getInstrumentTrackView(
    instrument: string | Instrument,
  ): InstrumentTrackView | undefined {
    return this.instruments.find(
      (v) => v.getName() === instrument || v.getKey() === instrument,
    );
  }

  public getInstrumentTrackViews(): readonly InstrumentTrackView[] {
    return this.instruments;
  }

  /** The named vocal track, or the first configured one when omitted. */
  public getVocalTrackView(
    instrument?: string | Instrument,
  ): VocalTrackView | undefined {
    const views = this.getVocalTrackViews();
    return instrument === undefined
      ? views[0]
      : views.find(
          (view) =>
            view.getName() === instrument || view.getKey() === instrument,
        );
  }

  public getVocalTrackViews(): readonly VocalTrackView[] {
    return this.instruments.filter(
      (view): view is VocalTrackView => view instanceof VocalTrackView,
    );
  }

  public attachTrack(track: MidiTrack): void {
    if (!this.midi.tracks.includes(track)) {
      this.midi.tracks.push(track);
    }
  }

  public getTrackDescriptors(): readonly TrackDescriptor[] {
    return this.config.tracks.map(describeTrack);
  }

  public getVisibleTrackDescriptors(): readonly TrackDescriptor[] {
    return this.getTrackDescriptors().filter(
      (descriptor) => descriptor.visible && descriptor.name !== "CHART HEADER",
    );
  }

  public getMidiTrack(
    descriptor: string | TrackDescriptor,
  ): MidiTrack | undefined {
    const key = typeof descriptor === "string" ? descriptor : descriptor.key;
    const config = this.getTrackDescriptors().find((item) => item.key === key);
    return config ? this.midi.getTrack(config.name) : undefined;
  }

  /** Materialize a configured track only for an intentional edit. */
  public ensureMidiTrack(key: string): MidiTrack | undefined {
    const descriptor = this.getTrackDescriptors().find(
      (item) => item.key === key,
    );
    if (!descriptor || descriptor.name === "CHART HEADER") return undefined;
    const existing = this.midi.getTrack(descriptor.name);
    if (existing) return existing;
    const track = new MidiTrack(descriptor.name);
    track.format = this.midi.header.format;
    // Without a TrackName event the track would save to .mid unnamed and
    // no longer map to its configured instrument on reload.
    track.addTextEvent(MetaType.TrackName, 0, descriptor.name);
    this.midi.tracks.push(track);
    this.midi.header.trackCount = this.midi.tracks.length;
    this.sync();
    return this.midi.getTrack(descriptor.name);
  }

  public getUnmappedMidiTracks(): readonly MidiTrack[] {
    const names = new Set(this.getTrackDescriptors().map((item) => item.name));
    return this.midi.tracks.filter((track) => !names.has(track.name));
  }
}

export { SongView, InstrumentType, Instrument, Difficulty, Note };
