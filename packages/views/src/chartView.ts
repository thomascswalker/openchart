import { Midi, MidiNote, MidiTrack } from "@midiedit/core";
import {
  defaultConfig,
  describeTrack,
  InstrumentTrackViewConfig,
  SongViewConfig,
  TrackDescriptor,
  TrackViewConfig,
} from "./config.js";

type Instrument =
  | "LEAD GUITAR"
  | "RHYTHM GUITAR"
  | "BASS"
  | "DRUMS"
  | "VOCALS"
  | "HARMONIES"
  | "SYNTH"
  | "OTHER";
enum InstrumentType {
  Lead = "LEAD GUITAR",
  Groove = "RHYTHM GUITAR",
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

  constructor(
    track: TrackView,
    midiTrack: MidiTrack | undefined,
    difficulty: Difficulty,
    offset: number,
    lanes: number,
  ) {
    this.track = track;
    this.midiTrack = midiTrack;
    this.difficulty = difficulty;
    this.offset = offset;
    this.lanes = lanes;
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

  public getNotes(): MidiNote[] {
    const low = this.offset;
    const high = this.offset + this.lanes;
    return this.midiTrack?.getNotes({ pitch: { low, high } }) ?? [];
  }

  public addNote(
    note: Note,
    start: number,
    end: number = 0,
    velocity: number = 100,
  ): void {
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      (end !== 0 && end < start) ||
      note < 0 ||
      note >= this.lanes
    ) {
      return;
    }

    this.midiTrack ??= this.getSong().ensureMidiTrack(this.track.getKey());
    if (!this.midiTrack) return;
    this.getSong().attachTrack(this.midiTrack);
    const pitch = this.offset + note;
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
  }

  public removeNote(note: MidiNote): boolean {
    if (
      !this.midiTrack ||
      note.note < this.offset ||
      note.note >= this.offset + this.lanes
    ) {
      return false;
    }

    this.getSong().attachTrack(this.midiTrack);
    return this.midiTrack.removeNote(note.noteOn, note.noteOff);
  }

  public moveNote(note: MidiNote, lane: Note, start: number): boolean {
    if (
      !this.midiTrack ||
      !Number.isInteger(start) ||
      start < 0 ||
      lane < 0 ||
      lane >= this.lanes ||
      note.note < this.offset ||
      note.note >= this.offset + this.lanes
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
      note.note < this.offset ||
      note.note >= this.offset + this.lanes
    ) {
      return false;
    }

    this.getSong().attachTrack(this.midiTrack);
    return this.midiTrack.setNoteDuration(note, end - note.start);
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
  private config: InstrumentTrackViewConfig;
  private expert: ChartView;
  private hard: ChartView;
  private medium: ChartView;
  private easy: ChartView;

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

    this.expert = new ChartView(
      this,
      this.track,
      Difficulty.Expert,
      config.offsets?.expert || 0,
      config.noteCount,
    );
    this.hard = new ChartView(
      this,
      this.track,
      Difficulty.Hard,
      config.offsets?.hard || 0,
      config.noteCount,
    );
    this.medium = new ChartView(
      this,
      this.track,
      Difficulty.Medium,
      config.offsets?.medium || 0,
      config.noteCount,
    );
    this.easy = new ChartView(
      this,
      this.track,
      Difficulty.Easy,
      config.offsets?.easy || 0,
      config.noteCount,
    );
  }

  public getName(): string {
    return this.config.name;
  }

  public override getKey(): string {
    return describeTrack(this.config).key;
  }

  public getMidiTrack(): MidiTrack | undefined {
    return this.track;
  }

  public getChart(difficulty: Difficulty) {
    switch (difficulty) {
      case Difficulty.Expert:
        return this.expert;
      case Difficulty.Hard:
        return this.hard;
      case Difficulty.Medium:
        return this.medium;
      case Difficulty.Easy:
        return this.easy;
    }
  }

  public getCharts(): ChartView[] {
    return [this.expert, this.hard, this.medium, this.easy];
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
            new InstrumentTrackView(
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
    this.midi.tracks.push(track);
    this.sync();
    return this.midi.getTrack(descriptor.name);
  }

  public getUnmappedMidiTracks(): readonly MidiTrack[] {
    const names = new Set(this.getTrackDescriptors().map((item) => item.name));
    return this.midi.tracks.filter((track) => !names.has(track.name));
  }
}

export { SongView, InstrumentType, Instrument, Difficulty, Note };
