import type {
  MidiChannelEvent,
  MidiNote,
  MidiTrack,
  TextMidiEvent,
} from "@openchart/core";
import {
  addVocalNote,
  addVocalPhrase,
  classifyVocalPitch,
  getVocalNotes,
  moveVocalNotes,
  removeVocalNotes,
  setVocalLyric,
  SongView,
  vocalKindNeedsLyric,
  vocalPhraseOverlaps,
  vocalPhrasePitch,
  type VocalLayout,
  type VocalMove,
  type VocalNoteKind,
  type VocalPhraseKind,
} from "@openchart/views";
import type { CanvasPoint } from "../../../rendering/geometry";
import type { CoordinateSystem } from "./coordinates";
import type {
  ClipboardNote,
  CreatedNote,
  MoveTarget,
  NoteEditingStrategy,
  ResizeTarget,
} from "./editingStrategy";
import type { PianoRollContext, PianoRollNote } from "./types";

/**
 * Vocal editing: notes and phrases are created by kind, lyrics stay on their
 * note's tick through every edit, pitched notes clamp to the vocal range and
 * nothing crosses between the pitch grid and the pinned lanes.
 */
export class VocalEditingStrategy implements NoteEditingStrategy {
  public readonly id = "vocal";
  private readonly context: PianoRollContext;
  private readonly coordinates: CoordinateSystem;
  private moveLyrics = new Map<MidiChannelEvent, TextMidiEvent | null>();
  private lastValidMoveTickDelta = 0;
  private lastPreviewPitch: number | null = null;

  public constructor(context: PianoRollContext, coordinates: CoordinateSystem) {
    this.context = context;
    this.coordinates = coordinates;
  }

  private get layout(): VocalLayout {
    const layout = this.context.getProfile().vocal;
    if (!layout) throw new Error("Vocal editing requires a vocal profile");
    return layout;
  }

  public getTrack(create: boolean): MidiTrack | null {
    const existing = this.context.getSelectedTrack();
    if (existing || !create) return existing;
    const midi = this.context.getMidi();
    if (!midi) return null;
    const name = this.context.getProfile().trackName ?? undefined;
    return new SongView(midi).getVocalTrackView(name)?.ensureTrack() ?? null;
  }

  private phraseOf(pitch: number): VocalPhraseKind | null {
    const classification = classifyVocalPitch(this.layout, pitch);
    return classification.type === "phrase" ? classification.kind : null;
  }

  private kindOf(pitch: number): VocalNoteKind | null {
    const classification = classifyVocalPitch(this.layout, pitch);
    return classification.type === "note" ? classification.kind : null;
  }

  public create(local: CanvasPoint): CreatedNote | null {
    const lane = this.coordinates.laneAtScreenY(local.y);
    const placement = this.context.getVocalPlacement();
    const tick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(local.x),
    );
    const end = tick + 1;

    // A lane decides the kind; otherwise the toolbar does.
    const phrase = lane ? lane.phrase : placement.phrase;
    if (phrase) {
      // Check before materializing the track so a rejected drag leaves the
      // document untouched.
      const pitch = vocalPhrasePitch(this.layout, phrase);
      if (
        vocalPhraseOverlaps(this.context.getSelectedTrack(), pitch, tick, end)
      ) {
        return null;
      }
      const track = this.getTrack(true);
      const created = track
        ? addVocalPhrase(track, this.layout, phrase, tick, end)
        : null;
      return created
        ? { noteOn: created.note.noteOn, needsLyric: false }
        : null;
    }

    const kind: VocalNoteKind =
      lane?.kind === "percussion" || lane?.kind === "pitchless"
        ? lane.kind
        : placement.noteKind;
    const pitch =
      kind === "pitched"
        ? this.coordinates.pitchAtScreenY(
            Math.max(local.y, this.coordinates.getGridTop()),
          )
        : lane?.createPitch;
    const track = this.getTrack(true);
    if (!track) return null;
    const created = addVocalNote(track, this.layout, kind, tick, end, {
      pitch,
    });
    if (!created) return null;
    if (kind === "pitched") this.preview(created.note.note, tick);
    return {
      noteOn: created.note.noteOn,
      needsLyric: vocalKindNeedsLyric(kind),
    };
  }

  public beginMove(targets: readonly MoveTarget[]): void {
    const track = this.getTrack(false);
    const paired = new Map(
      getVocalNotes(track, this.layout).map((item) => [
        item.note.noteOn,
        item.lyric?.event ?? null,
      ]),
    );
    this.moveLyrics = new Map(
      targets.map(({ note }) => [
        note.midiNote.noteOn,
        paired.get(note.midiNote.noteOn) ?? null,
      ]),
    );
    this.lastValidMoveTickDelta = 0;
    this.lastPreviewPitch =
      targets.length === 1 ? targets[0].initialPitch : null;
  }

  /** True when the phrase targets fit at `tickDelta` without overlaps. */
  private phrasesFit(
    track: MidiTrack,
    phrases: readonly { note: MidiNote; start: number }[],
    tickDelta: number,
    durationDelta = 0,
  ): boolean {
    const moving = phrases.map(({ note }) => note);
    return phrases.every(({ note, start }) => {
      const newStart = Math.max(0, start + tickDelta);
      const newEnd =
        newStart + Math.max(1, note.end - note.start + durationDelta);
      return !vocalPhraseOverlaps(track, note.note, newStart, newEnd, moving);
    });
  }

  public move(
    targets: readonly MoveTarget[],
    tickDelta: number,
    pitchDelta: number,
  ): boolean {
    const track = this.getTrack(false);
    if (!track) return false;
    // Phrases may not overlap a stationary phrase of the same kind. When a
    // frame would cause one, keep the last valid horizontal offset.
    const movingPhrases = targets
      .filter(({ note }) => this.phraseOf(note.pitch))
      .map(({ note }) => note.midiNote);
    const fits = targets.every(({ note, initialTick }) => {
      if (!this.phraseOf(note.pitch)) return true;
      const duration = note.midiNote.end - note.midiNote.start;
      const start = Math.max(0, initialTick + tickDelta);
      return !vocalPhraseOverlaps(
        track,
        note.midiNote.note,
        start,
        start + duration,
        movingPhrases,
      );
    });
    if (fits) this.lastValidMoveTickDelta = tickDelta;
    const appliedTickDelta = this.lastValidMoveTickDelta;

    let changed = false;
    const moves: VocalMove[] = [];
    for (const { note, initialTick, initialPitch } of targets) {
      const start = Math.max(0, initialTick + appliedTickDelta);
      if (this.phraseOf(note.pitch)) {
        if (note.midiNote.start !== start) {
          changed = track.setNoteStart(note.midiNote, start) || changed;
        }
        continue;
      }
      moves.push({
        note: note.midiNote,
        start,
        pitch: initialPitch + pitchDelta,
        lyric: this.moveLyrics.get(note.midiNote.noteOn) ?? null,
      });
    }
    changed = moveVocalNotes(track, this.layout, moves) || changed;

    if (
      targets.length === 1 &&
      this.kindOf(targets[0].note.pitch) === "pitched"
    ) {
      const pitch = targets[0].note.midiNote.note;
      if (pitch !== this.lastPreviewPitch) {
        this.lastPreviewPitch = pitch;
        this.preview(pitch, targets[0].note.midiNote.start);
      }
    }
    return changed;
  }

  public resize(targets: readonly ResizeTarget[], delta: number): boolean {
    const track = this.getTrack(false);
    if (!track) return false;
    const phrases = targets
      .filter(({ note }) => this.phraseOf(note.pitch))
      .map(({ note, initialDuration }) => ({
        note: note.midiNote,
        start: note.midiNote.start,
        initialDuration,
      }));
    const moving = phrases.map(({ note }) => note);
    const fits = phrases.every(
      ({ note, start, initialDuration }) =>
        !vocalPhraseOverlaps(
          track,
          note.note,
          start,
          start + Math.max(1, initialDuration + delta),
          moving,
        ),
    );
    if (!fits) return false;
    let changed = false;
    for (const { note, initialDuration } of targets) {
      changed =
        track.setNoteDuration(
          note.midiNote,
          Math.max(1, initialDuration + delta),
        ) || changed;
    }
    return changed;
  }

  public remove(notes: readonly PianoRollNote[]): boolean {
    const track = this.getTrack(false);
    return track
      ? removeVocalNotes(
          track,
          this.layout,
          notes.map((note) => note.midiNote),
        )
      : false;
  }

  public transpose(
    notes: readonly PianoRollNote[],
    semitones: number,
  ): boolean {
    const track = this.getTrack(false);
    if (!track) return false;
    // Only pitched notes transpose; phrases and lane notes keep their pitch.
    const moves = notes
      .filter((note) => this.kindOf(note.pitch) === "pitched")
      .map((note) => ({
        note: note.midiNote,
        start: note.tick,
        pitch: note.pitch + semitones,
      }));
    return moveVocalNotes(track, this.layout, moves);
  }

  public shift(notes: readonly PianoRollNote[], deltaTicks: number): boolean {
    const track = this.getTrack(false);
    if (!track) return false;
    const delta = Math.round(deltaTicks);
    const phrases = notes
      .filter((note) => this.phraseOf(note.pitch))
      .map((note) => ({ note: note.midiNote, start: note.tick }));
    if (!this.phrasesFit(track, phrases, delta)) return false;
    let changed = false;
    for (const { note, start } of phrases) {
      changed = track.setNoteStart(note, Math.max(0, start + delta)) || changed;
    }
    const moves = notes
      .filter((note) => !this.phraseOf(note.pitch))
      .map((note) => ({ note: note.midiNote, start: note.tick + delta }));
    return moveVocalNotes(track, this.layout, moves) || changed;
  }

  public copy(notes: readonly PianoRollNote[]): ClipboardNote[] {
    if (notes.length === 0) return [];
    const lyrics = new Map(
      getVocalNotes(this.getTrack(false), this.layout).map((item) => [
        item.note.noteOn,
        item.lyric?.event.data.text,
      ]),
    );
    const minTick = Math.min(...notes.map((note) => note.tick));
    return notes.map((note) => ({
      relativeTick: note.tick - minTick,
      pitch: note.pitch,
      durationTicks: note.durationTicks,
      velocity: note.velocity,
      lyric: lyrics.get(note.midiNote.noteOn),
    }));
  }

  public paste(
    entries: readonly ClipboardNote[],
    anchorTick: number,
  ): MidiChannelEvent[] {
    const track = this.getTrack(true);
    if (!track) return [];
    const pasted: MidiChannelEvent[] = [];
    for (const entry of entries) {
      const start = Math.max(0, anchorTick + entry.relativeTick);
      const end = start + Math.max(1, entry.durationTicks);
      const classification = classifyVocalPitch(this.layout, entry.pitch);
      if (classification.type === "phrase") {
        const phrase = addVocalPhrase(
          track,
          this.layout,
          classification.kind,
          start,
          end,
        );
        if (phrase) pasted.push(phrase.note.noteOn);
      } else if (classification.type === "note") {
        const note = addVocalNote(
          track,
          this.layout,
          classification.kind,
          start,
          end,
          { pitch: entry.pitch, lyric: entry.lyric, velocity: entry.velocity },
        );
        if (note) pasted.push(note.note.noteOn);
      }
    }
    return pasted;
  }

  public setLyric(noteOn: MidiChannelEvent, text: string): boolean {
    const track = this.getTrack(false);
    const note = track?.getNotes().find((item) => item.noteOn === noteOn);
    return track && note
      ? setVocalLyric(track, this.layout, note, text)
      : false;
  }

  private preview(pitch: number, tick: number): void {
    const ppqn = this.context.getPpqn();
    this.context.previewNotes([
      {
        tick,
        durationTicks: ppqn / 2,
        pitch,
        velocity: 100,
        midiNote: {} as MidiNote,
      },
    ]);
  }
}
