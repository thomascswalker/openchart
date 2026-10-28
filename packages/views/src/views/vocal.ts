import {
  MetaType,
  type MidiNote,
  type MidiTrack,
  type TextMidiEvent,
} from "@openchart/midi";
import type { MidiNotePhrase } from "../editing/phrase.js";
import type { PhraseEffect } from "../config.js";
import type { TrackRules } from "../ruleset/compile.js";
import { expandPitchSet } from "../ruleset/semantics.js";
import { phraseLabel } from "../ruleset/labels.js";
import type { SongView } from "./song.js";
import { TrackView } from "./track.js";

/** Note kinds that live on the VOCALS track. */
export type VocalNoteKind = "pitched" | "pitchless" | "percussion";

/** Phrase kinds that live on the VOCALS track. */
export type VocalPhraseKind = "vocal" | "power-window" | "stagepower";

export interface VocalLaneSpec {
  /** Lane id derived from the ruleset (`vocal-phrase`, `power-window`, ...). */
  id: string;
  label: string;
  pitches: readonly number[];
  createPitch: number;
  kind: VocalNoteKind | `phrase:${VocalPhraseKind}`;
  phrase: VocalPhraseKind | null;
}

export type VocalClassification =
  | { type: "note"; kind: VocalNoteKind }
  | { type: "phrase"; kind: VocalPhraseKind }
  | { type: "unknown" };

/**
 * Resolved MIDI pitches for every vocal note and phrase kind. A kind the
 * ruleset does not define is `-1`, which never matches a real pitch.
 */
export interface VocalLayout {
  /** Inclusive pitched-note range. */
  range: { low: number; high: number };
  vocalPhrase: number;
  powerWindow: number;
  power: number;
  percussion: number;
  pitchlessHigh: number;
  pitchlessLow: number;
  /** Pitch that new pitchless notes are written to. */
  pitchlessPlacement: number;
}

export const VOCAL_PHRASE_KINDS: readonly VocalPhraseKind[] = [
  "vocal",
  "power-window",
  "stagepower",
];

export type TimedLyric = TextMidiEvent;

export interface VocalNote {
  note: MidiNote;
  kind: VocalNoteKind;
  /** The Lyric event on the note's tick, if any. Percussion is always null. */
  lyric: TimedLyric | null;
}

export interface AddVocalNoteOptions {
  /** Required for pitched notes; selects 85 or 35 for pitchless notes. */
  pitch?: number;
  /** Lyric written on the note's tick in the same operation. */
  lyric?: string;
  velocity?: number;
}

export interface VocalMove {
  note: MidiNote;
  start: number;
  /** New pitch; only applied to pitched notes, clamped to the range. */
  pitch?: number;
  /**
   * Lyric captured when the gesture began. Pass it for multi-frame drags so
   * notes crossing each other's ticks keep their own lyric. Looked up when
   * omitted.
   */
  lyric?: TextMidiEvent | null;
}

export type VocalIssue =
  | { type: "missing-lyric"; tick: number; note: MidiNote }
  | { type: "orphan-lyric"; tick: number; lyric: TextMidiEvent }
  | {
      type: "mismatched-tick";
      tick: number;
      lyric: TextMidiEvent;
      note: MidiNote;
    };

export interface VocalValidationOptions {
  /** A lyric within this many ticks of a lyric-less note is a near miss. */
  mismatchTolerance?: number;
}

export interface VocalRepairOptions extends VocalValidationOptions {
  /** Also delete lyrics with no note nearby. Off by default (keeps text). */
  removeOrphans?: boolean;
}

interface LyricPairing {
  notes: VocalNote[];
  orphans: TimedLyric[];
  unknown: MidiNote[];
}

const PHRASE_KIND_EFFECT: Record<VocalPhraseKind, PhraseEffect> = {
  vocal: "lyricPhrase",
  "power-window": "powerWindow",
  stagepower: "starPower",
};

/**
 * Read-only, kind-aware view of a vocals track: pitched, pitchless and
 * percussion notes, vocal / power-window / stage-power phrases and the lyric
 * events paired to notes. Editing operations are available on this view so
 * they share its track and rules-derived layout.
 */
export class VocalTrackView extends TrackView {
  private readonly layout: VocalLayout;

  constructor(
    song: SongView,
    midiTrack: MidiTrack | undefined,
    rules: TrackRules,
  ) {
    super(song, midiTrack, rules);
    this.layout = VocalTrackView.layoutFromRules(rules);
  }

  /** Builds the vocal layout from a vocals track's compiled rules. */
  public static layoutFromRules(rules: TrackRules): VocalLayout {
    const pitchesOf = (kind: "pitched" | "pitchless" | "percussion") =>
      rules.noteClasses
        .filter((c) => c.class === kind)
        .flatMap((c) => expandPitchSet(c.pitches));
    const phrasePitch = (effect: PhraseEffect): number =>
      rules.phrases.find((p) => p.effect === effect)?.pitches[0] ?? -1;

    const pitched = pitchesOf("pitched");
    const pitchless = pitchesOf("pitchless");
    const percussion = pitchesOf("percussion");
    const pitchlessHigh = pitchless.length > 0 ? Math.max(...pitchless) : -1;
    return {
      range:
        pitched.length > 0
          ? { low: Math.min(...pitched), high: Math.max(...pitched) }
          : { low: -1, high: -2 },
      vocalPhrase: phrasePitch("lyricPhrase"),
      powerWindow: phrasePitch("powerWindow"),
      power: phrasePitch("starPower"),
      percussion: percussion[0] ?? -1,
      pitchlessHigh,
      pitchlessLow: pitchless.length > 0 ? Math.min(...pitchless) : -1,
      pitchlessPlacement: pitchlessHigh,
    };
  }

  /** Lane descriptors for a particular rules-derived layout. */
  public static laneSpecs(layout: VocalLayout): VocalLaneSpec[] {
    const phrase = (
      id: string,
      kind: VocalPhraseKind,
      pitch: number,
    ): VocalLaneSpec => ({
      id,
      label: phraseLabel(PHRASE_KIND_EFFECT[kind]),
      pitches: [pitch],
      createPitch: pitch,
      kind: `phrase:${kind}`,
      phrase: kind,
    });
    const specs: VocalLaneSpec[] = [
      phrase("vocal-phrase", "vocal", layout.vocalPhrase),
      phrase("power-window", "power-window", layout.powerWindow),
      phrase("stagepower", "stagepower", layout.power),
      {
        id: "percussion",
        label: "Perc",
        pitches: [layout.percussion],
        createPitch: layout.percussion,
        kind: "percussion",
        phrase: null,
      },
      {
        id: "pitchless",
        label: "Spoken",
        pitches: [layout.pitchlessHigh, layout.pitchlessLow],
        createPitch: layout.pitchlessPlacement,
        kind: "pitchless",
        phrase: null,
      },
    ];
    return specs.filter((spec) => spec.createPitch >= 0);
  }

  /** Classifies a pitch against a particular rules-derived layout. */
  public static classifyPitch(
    layout: VocalLayout,
    pitch: number,
  ): VocalClassification {
    if (pitch >= layout.range.low && pitch <= layout.range.high) {
      return { type: "note", kind: "pitched" };
    }
    if (pitch === layout.pitchlessHigh || pitch === layout.pitchlessLow) {
      return { type: "note", kind: "pitchless" };
    }
    if (pitch === layout.percussion) {
      return { type: "note", kind: "percussion" };
    }
    if (pitch === layout.vocalPhrase) {
      return { type: "phrase", kind: "vocal" };
    }
    if (pitch === layout.powerWindow) {
      return { type: "phrase", kind: "power-window" };
    }
    if (pitch === layout.power) return { type: "phrase", kind: "stagepower" };
    return { type: "unknown" };
  }

  public static kindNeedsLyric(kind: VocalNoteKind): boolean {
    return kind !== "percussion";
  }

  public static phrasePitch(
    layout: VocalLayout,
    kind: VocalPhraseKind,
  ): number {
    switch (kind) {
      case "vocal":
        return layout.vocalPhrase;
      case "power-window":
        return layout.powerWindow;
      case "stagepower":
        return layout.power;
    }
  }

  /** Pitch for a new note, or null when the requested kind/pitch is invalid. */
  public static notePitch(
    layout: VocalLayout,
    kind: VocalNoteKind,
    pitch?: number,
  ): number | null {
    switch (kind) {
      case "pitched":
        return pitch !== undefined &&
          Number.isInteger(pitch) &&
          pitch >= layout.range.low &&
          pitch <= layout.range.high
          ? pitch
          : null;
      case "pitchless":
        return pitch === layout.pitchlessHigh || pitch === layout.pitchlessLow
          ? pitch
          : layout.pitchlessPlacement;
      case "percussion":
        return layout.percussion;
    }
  }

  /** Read lyrics from a track when no track view is available. */
  public static readLyrics(track: MidiTrack | undefined | null): TimedLyric[] {
    if (!track) return [];
    return track
      .getTextEvents()
      .filter((event) => event.type === MetaType.Lyric);
  }

  /** Read vocal notes when only a MIDI track and rules-derived layout exist. */
  public static readNotes(
    track: MidiTrack | undefined | null,
    layout: VocalLayout,
    kind?: VocalNoteKind,
  ): VocalNote[] {
    const { notes } = VocalTrackView.pairLyrics(track, layout);
    return kind ? notes.filter((note) => note.kind === kind) : notes;
  }

  /** Find a vocal note when only a MIDI track and layout are available. */
  public static findNote(
    track: MidiTrack | undefined | null,
    layout: VocalLayout,
    note: MidiNote,
  ): VocalNote | null {
    return (
      VocalTrackView.readNotes(track, layout).find(
        (candidate) => candidate.note.noteOn === note.noteOn,
      ) ?? null
    );
  }

  /** Read phrases when only a MIDI track and layout are available. */
  public static readPhrases(
    track: MidiTrack | undefined | null,
    layout: VocalLayout,
    kind: VocalPhraseKind,
  ): MidiNotePhrase[] {
    if (!track) return [];
    const pitch = VocalTrackView.phrasePitch(layout, kind);
    return track
      .getNotes({ pitch: { low: pitch, high: pitch + 1 } })
      .map((note) => ({ start: note.start, end: note.end, kind, note }));
  }

  /** Validate vocal lyrics when only a MIDI track and layout are available. */
  public static validateTrack(
    track: MidiTrack | undefined | null,
    layout: VocalLayout,
    options: VocalValidationOptions = {},
  ): VocalIssue[] {
    if (!track) return [];
    const tolerance = Math.max(0, options.mismatchTolerance ?? 10);
    const { notes, orphans } = VocalTrackView.pairLyrics(track, layout);
    const issues: VocalIssue[] = [];
    const missing = notes.filter(
      (item) => VocalTrackView.kindNeedsLyric(item.kind) && !item.lyric,
    );
    const matchedMissing = new Set<MidiNote>();
    for (const orphan of orphans) {
      const near = missing.find(
        (item) =>
          !matchedMissing.has(item.note) &&
          Math.abs(item.note.start - orphan.tick) <= tolerance,
      );
      if (near) {
        matchedMissing.add(near.note);
        issues.push({
          type: "mismatched-tick",
          tick: orphan.tick,
          lyric: orphan,
          note: near.note,
        });
      } else {
        issues.push({
          type: "orphan-lyric",
          tick: orphan.tick,
          lyric: orphan,
        });
      }
    }
    for (const item of missing) {
      if (matchedMissing.has(item.note)) continue;
      issues.push({
        type: "missing-lyric",
        tick: item.note.start,
        note: item.note,
      });
    }
    return issues.sort((a, b) => a.tick - b.tick);
  }

  private static validSpan(start: number, end: number): boolean {
    return (
      Number.isInteger(start) &&
      start >= 0 &&
      Number.isInteger(end) &&
      end > start
    );
  }

  private static pairLyrics(
    track: MidiTrack | undefined | null,
    layout: VocalLayout,
  ): LyricPairing {
    if (!track) return { notes: [], orphans: [], unknown: [] };
    const byTick = new Map<number, TimedLyric[]>();
    for (const lyric of VocalTrackView.readLyrics(track)) {
      const list = byTick.get(lyric.tick) ?? [];
      list.push(lyric);
      byTick.set(lyric.tick, list);
    }
    const notes: VocalNote[] = [];
    const unknown: MidiNote[] = [];
    const percussionTicks = new Set<number>();
    for (const note of track.getNotes()) {
      const classification = VocalTrackView.classifyPitch(layout, note.pitch);
      if (classification.type === "unknown") {
        unknown.push(note);
        continue;
      }
      if (classification.type !== "note") continue;
      const { kind } = classification;
      if (!VocalTrackView.kindNeedsLyric(kind)) {
        percussionTicks.add(note.start);
        notes.push({ note, kind, lyric: null });
        continue;
      }
      const lyric = byTick.get(note.start)?.shift() ?? null;
      notes.push({ note, kind, lyric });
    }
    const orphans: TimedLyric[] = [];
    for (const [tick, lyrics] of byTick) {
      if (percussionTicks.has(tick)) continue;
      orphans.push(...lyrics);
    }
    orphans.sort((a, b) => a.tick - b.tick);
    return { notes, orphans, unknown };
  }

  private insertNote(
    pitch: number,
    start: number,
    end: number,
    velocity = 100,
  ): MidiNote | null {
    return (
      this.track?.insertNote({
        tick: start,
        pitch,
        velocity,
        duration: Math.max(1, end - start),
      }) ?? null
    );
  }

  public getLayout(): VocalLayout {
    return this.layout;
  }

  public classify(pitch: number): VocalClassification {
    return VocalTrackView.classifyPitch(this.layout, pitch);
  }

  public getNoteRevision(): number {
    return this.track?.getNoteRevision() ?? 0;
  }

  /** Notes of every kind (or one kind), each with its paired lyric. */
  public getNotes(kind?: VocalNoteKind): VocalNote[] {
    return VocalTrackView.readNotes(this.track, this.layout, kind);
  }

  public getVocalNote(note: MidiNote): VocalNote | null {
    return VocalTrackView.findNote(this.track, this.layout, note);
  }

  public getPhrases(kind: VocalPhraseKind): MidiNotePhrase[] {
    return VocalTrackView.readPhrases(this.track, this.layout, kind);
  }

  public getLyrics(): TimedLyric[] {
    return VocalTrackView.readLyrics(this.track);
  }

  public getLyricFor(note: MidiNote): TextMidiEvent | null {
    return this.getVocalNote(note)?.lyric ?? null;
  }

  /** Adds a note and its optional lyric as one view operation. */
  public addNote(
    kind: VocalNoteKind,
    start: number,
    end: number,
    options: AddVocalNoteOptions = {},
  ): VocalNote | null {
    const track = this.track;
    const pitch = VocalTrackView.notePitch(this.layout, kind, options.pitch);
    if (!track || pitch === null || !VocalTrackView.validSpan(start, end)) {
      return null;
    }
    const note = this.insertNote(pitch, start, end, options.velocity);
    if (!note) return null;
    let lyric: TimedLyric | null = null;
    const text = options.lyric;
    if (
      VocalTrackView.kindNeedsLyric(kind) &&
      text !== undefined &&
      text.trim()
    ) {
      lyric = track.addTextEvent(MetaType.Lyric, note.start, text);
    }
    return { note, kind, lyric };
  }

  /** Moves notes, keeping each lyric on its note's tick. */
  public moveNotes(moves: readonly VocalMove[]): boolean {
    const track = this.track;
    if (!track) return false;
    const paired = new Map(
      this.getNotes().map((item) => [item.note.noteOn, item]),
    );
    const resolved = moves.map((move) => ({
      ...move,
      lyric:
        move.lyric !== undefined
          ? move.lyric
          : (paired.get(move.note.noteOn)?.lyric ?? null),
    }));
    let changed = false;
    for (const move of resolved) {
      const start = Math.max(0, Math.round(move.start));
      let pitch = move.note.pitch;
      const classification = this.classify(move.note.pitch);
      if (
        move.pitch !== undefined &&
        classification.type === "note" &&
        classification.kind === "pitched"
      ) {
        pitch = Math.max(
          this.layout.range.low,
          Math.min(this.layout.range.high, Math.round(move.pitch)),
        );
      }
      if (move.note.start !== start || pitch !== move.note.pitch) {
        const duration = move.note.end - move.note.start;
        changed =
          track.updateNote(move.note, {
            start,
            duration,
            pitch,
          }) || changed;
      }
      if (move.lyric) {
        changed = track.moveEvent(move.lyric, start) || changed;
      }
    }
    return changed;
  }

  /** Removes notes and their attached lyrics. */
  public removeNotes(notes: readonly MidiNote[]): boolean {
    const track = this.track;
    if (!track) return false;
    const paired = new Map(
      this.getNotes().map((item) => [item.note.noteOn, item]),
    );
    const lyrics = notes
      .map((note) => paired.get(note.noteOn)?.lyric)
      .filter(
        (event): event is TextMidiEvent =>
          event !== null && event !== undefined,
      );
    let changed = false;
    for (const note of notes) {
      changed = track.removeNote(note.noteOn, note.noteOff) || changed;
    }
    for (const lyric of lyrics) changed = track.removeEvent(lyric) || changed;
    return changed;
  }

  /** Sets or replaces a note's lyric. Empty text is rejected. */
  public setLyric(note: MidiNote, text: string): boolean {
    const track = this.track;
    if (!track || !text.trim()) return false;
    const vocal = this.getVocalNote(note);
    if (!vocal || !VocalTrackView.kindNeedsLyric(vocal.kind)) return false;
    if (vocal.lyric) return track.updateTextEvent(vocal.lyric, text);
    track.addTextEvent(MetaType.Lyric, note.start, text);
    return true;
  }

  /** True when [start, end) intersects another phrase on the same pitch. */
  public phraseOverlaps(
    pitch: number,
    start: number,
    end: number,
    ignore: readonly MidiNote[] = [],
  ): boolean {
    if (!this.track) return false;
    const ignored = new Set(ignore.map((note) => note.noteOn));
    return this.track
      .getNotes({ pitch: { low: pitch, high: pitch + 1 } })
      .some(
        (note) =>
          !ignored.has(note.noteOn) && note.start < end && start < note.end,
      );
  }

  /** Adds a phrase, rejecting overlap with a phrase of the same kind. */
  public addPhrase(
    kind: VocalPhraseKind,
    start: number,
    end: number,
  ): MidiNotePhrase | null {
    if (
      !this.track ||
      !VocalTrackView.validSpan(start, end) ||
      this.phraseOverlaps(
        VocalTrackView.phrasePitch(this.layout, kind),
        start,
        end,
      )
    ) {
      return null;
    }
    const note = this.insertNote(
      VocalTrackView.phrasePitch(this.layout, kind),
      start,
      end,
    );
    return note ? { start: note.start, end: note.end, kind, note } : null;
  }

  /** Moves/resizes a phrase, rejecting overlap with another phrase. */
  public updatePhrase(
    note: MidiNote,
    start: number,
    end: number,
    ignore: readonly MidiNote[] = [],
  ): boolean {
    const track = this.track;
    if (!track || !VocalTrackView.validSpan(start, end)) return false;
    if (this.phraseOverlaps(note.pitch, start, end, [note, ...ignore])) {
      return false;
    }
    if (note.start === start && note.end === end) return true;
    return track.updateNote(note, { start, duration: end - start });
  }

  public validate(options?: VocalValidationOptions): VocalIssue[] {
    return VocalTrackView.validateTrack(this.track, this.layout, options);
  }

  /** Snaps near-miss lyrics onto their notes; returns the number fixed. */
  public repair(options?: VocalRepairOptions): number {
    const track = this.track;
    if (!track) return 0;
    let fixed = 0;
    for (const issue of this.validate(options)) {
      if (issue.type === "mismatched-tick") {
        if (track.moveEvent(issue.lyric, issue.note.start)) fixed++;
      } else if (issue.type === "orphan-lyric" && options?.removeOrphans) {
        if (track.removeEvent(issue.lyric)) fixed++;
      }
    }
    return fixed;
  }
}
