import type {
  MidiChannelEvent,
  MidiNote,
  MidiTrack,
  TextEvent,
} from "@openchart/core";
import {
  SongView,
  addVocalNote,
  addVocalPhrase,
  classifyVocalPitch,
  getVocalNotes,
  moveVocalNotes,
  removeVocalNotes,
  setVocalLyric,
  vocalKindNeedsLyric,
  vocalPhraseOverlaps,
  vocalPhrasePitch,
  type VocalLayout,
  type VocalMove,
  type VocalNoteKind,
  type VocalPhraseKind,
} from "@openchart/views";
import type { Vector2 } from "three";
import { DefaultNoteVelocity, NewNoteDurationTicks } from "../constants";
import type { CoordinateSystem } from "../coordinates";
import { applyToEach, type IEditContext } from "./context";
import {
  type ClipboardNote,
  type CreatedNote,
  type MoveTarget,
  type ResizeTarget,
} from "./types";
import type { LaneDef } from "../profile";
import type { PianoRollContext, PianoRollNote } from "../types";

/** Where a phrase would sit after an edit, used to detect overlaps. */
interface PhrasePlacement {
  /** The phrase note being placed. */
  note: MidiNote;

  /** Start tick after the edit. */
  start: number;

  /** Duration, in ticks, after the edit. */
  duration: number;
}

/** What a create gesture needs to decide between a phrase and a note. */
interface VocalCreateRequest {
  /** Pinned lane under the pointer, or null when it is over the grid. */
  lane: LaneDef | null;

  /** Kind of note the toolbar is set to place. */
  placementKind: VocalNoteKind;

  /** Snapped start tick. */
  tick: number;

  /** End tick of the new item. */
  end: number;

  /** Screen Y of the pointer, used to pick a pitch in the grid. */
  screenY: number;
}

/**
 * Vocal editing: notes and phrases are created by kind, lyrics stay on their
 * note's tick through every edit, pitched notes clamp to the vocal range and
 * nothing crosses between the pitch grid and the pinned lanes.
 */
export class VocalEditContext implements IEditContext {
  public readonly id = "vocals";

  /** Supplies the profile, selected track and vocal placement. */
  private readonly context: PianoRollContext;

  /** Converts canvas positions to ticks, pitches and lanes. */
  private readonly coordinates: CoordinateSystem;

  /** Lyric events captured when a move began, so lyrics follow their notes. */
  private moveLyrics = new Map<MidiChannelEvent, TextEvent | null>();

  /** Last horizontal offset of the current move that kept phrases valid. */
  private lastValidMoveTickDelta = 0;

  /** Pitch most recently auditioned, to avoid repeating the same preview. */
  private lastPreviewPitch: number | null = null;

  public constructor(context: PianoRollContext, coordinates: CoordinateSystem) {
    this.context = context;
    this.coordinates = coordinates;
  }

  /** The profile's vocal layout; throws when the profile is not vocal. */
  private get layout(): VocalLayout {
    const layout = this.context.getProfile().vocal;
    if (!layout) throw new Error("Vocal editing requires a vocal profile");

    return layout;
  }

  /**
   * The selected track.
   */
  public getTrack(): MidiTrack | null {
    return this.context.getSelectedTrack();
  }

  /** Vocal edits can materialize their configured track when needed. */
  public canCreateTrack(): boolean {
    return this.context.getMidi() !== null;
  }

  /** Creates a phrase or note depending on the lane and toolbar placement. */
  public create(local: Vector2): CreatedNote | null {
    const lane = this.coordinates.laneAtScreenY(local.y);
    const placement = this.context.getVocalPlacement();
    const tick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(local.x),
    );
    const request: VocalCreateRequest = {
      lane,
      placementKind: placement.noteKind,
      tick,
      end: tick + NewNoteDurationTicks,
      screenY: local.y,
    };

    // A lane decides the kind; otherwise the toolbar does.
    const phrase = lane ? lane.phrase : placement.phrase;
    if (phrase) return this.createPhrase(phrase, request);

    return this.createNote(request);
  }

  /** Captures lyrics and resets move state when a move gesture starts. */
  public beginMove(targets: readonly MoveTarget[]): void {
    const track = this.getTrack();
    const lyricsByNoteOn = new Map(
      getVocalNotes(track, this.layout).map((item) => [
        item.note.noteOn,
        item.lyric ?? null,
      ]),
    );

    this.moveLyrics = new Map(
      targets.map(({ note }) => [
        note.midiNote.noteOn,
        lyricsByNoteOn.get(note.midiNote.noteOn) ?? null,
      ]),
    );
    this.lastValidMoveTickDelta = 0;
    this.lastPreviewPitch =
      targets.length === 1 ? targets[0].initialPitch : null;
  }

  /**
   * Moves phrases horizontally and notes in both axes. A frame that would
   * overlap another phrase keeps the last valid horizontal offset.
   */
  public move(
    targets: readonly MoveTarget[],
    tickDelta: number,
    pitchDelta: number,
  ): boolean {
    const track = this.getTrack();
    if (!track) return false;

    const appliedTickDelta = this.resolveMoveTickDelta(
      track,
      targets,
      tickDelta,
    );
    const phrasesChanged = this.movePhrases(track, targets, appliedTickDelta);
    const notesChanged = this.moveNotes(
      track,
      targets,
      appliedTickDelta,
      pitchDelta,
    );
    this.previewMovedNote(targets);

    return notesChanged || phrasesChanged;
  }

  /** Resizes targets unless a phrase would then overlap another phrase. */
  public resize(targets: readonly ResizeTarget[], delta: number): boolean {
    const track = this.getTrack();
    if (!track) return false;

    // Phrases may not overlap a stationary phrase of the same kind.
    const phrasePlacements = targets
      .filter(({ note }) => this.phraseOf(note.pitch))
      .map(({ note, initialDuration }) => ({
        note: note.midiNote,
        start: note.midiNote.start,
        duration: Math.max(1, initialDuration + delta),
      }));
    if (!this.phrasesFit(track, phrasePlacements)) return false;

    return applyToEach(targets, ({ note, initialDuration }) =>
      track.setNoteDuration(
        note.midiNote,
        Math.max(1, initialDuration + delta),
      ),
    );
  }

  /** Deletes notes and phrases through the vocal data model. */
  public remove(notes: readonly PianoRollNote[]): boolean {
    const track = this.getTrack();
    if (!track) return false;

    return removeVocalNotes(
      track,
      this.layout,
      notes.map((note) => note.midiNote),
    );
  }

  /** Transposes pitched notes; phrases and lane notes keep their pitch. */
  public transpose(
    notes: readonly PianoRollNote[],
    semitones: number,
  ): boolean {
    const track = this.getTrack();
    if (!track) return false;

    const moves = notes
      .filter((note) => this.kindOf(note.pitch) === "pitched")
      .map((note) => ({
        note: note.midiNote,
        start: note.tick,
        pitch: note.pitch + semitones,
      }));

    return moveVocalNotes(track, this.layout, moves);
  }

  /** Shifts notes and phrases in time; refuses when phrases would overlap. */
  public shift(notes: readonly PianoRollNote[], deltaTicks: number): boolean {
    const track = this.getTrack();
    if (!track) return false;

    const delta = Math.round(deltaTicks);
    const phrasePlacements = notes
      .filter((note) => this.phraseOf(note.pitch))
      .map((note) => ({
        note: note.midiNote,
        start: Math.max(0, note.tick + delta),
        duration: Math.max(1, note.midiNote.end - note.midiNote.start),
      }));
    if (!this.phrasesFit(track, phrasePlacements)) return false;

    // Phrases move directly; everything else goes through the vocal model.
    const phrasesChanged = applyToEach(phrasePlacements, (placement) =>
      track.setNoteStart(placement.note, placement.start),
    );
    const moves = notes
      .filter((note) => !this.phraseOf(note.pitch))
      .map((note) => ({ note: note.midiNote, start: note.tick + delta }));

    return moveVocalNotes(track, this.layout, moves) || phrasesChanged;
  }

  /** Captures notes together with their lyrics. */
  public copy(notes: readonly PianoRollNote[]): ClipboardNote[] {
    if (notes.length === 0) return [];

    const lyricsByNoteOn = new Map(
      getVocalNotes(this.getTrack(), this.layout).map((item) => [
        item.note.noteOn,
        item.lyric?.text,
      ]),
    );
    const minTick = Math.min(...notes.map((note) => note.tick));

    return notes.map((note) => ({
      relativeTick: note.tick - minTick,
      pitch: note.pitch,
      durationTicks: note.durationTicks,
      velocity: note.velocity,
      lyric: lyricsByNoteOn.get(note.midiNote.noteOn),
    }));
  }

  /** Inserts clipboard entries as phrases or notes, creating the track. */
  public paste(
    entries: readonly ClipboardNote[],
    anchorTick: number,
  ): MidiChannelEvent[] {
    const track = this.getOrCreateTrack();
    if (!track) return [];

    const pasted: MidiChannelEvent[] = [];
    for (const entry of entries) {
      const noteOn = this.pasteEntry(track, entry, anchorTick);
      if (noteOn) pasted.push(noteOn);
    }

    return pasted;
  }

  /** Writes the lyric of the note identified by `noteOn`. */
  public setLyric(noteOn: MidiChannelEvent, text: string): boolean {
    const track = this.getTrack();
    const note = track?.getNotes().find((item) => item.noteOn === noteOn);
    if (!track || !note) return false;

    return setVocalLyric(track, this.layout, note, text);
  }

  /** The phrase kind drawn at `pitch`, or null when it is not a phrase pitch. */
  private phraseOf(pitch: number): VocalPhraseKind | null {
    const classification = classifyVocalPitch(this.layout, pitch);
    return classification.type === "phrase" ? classification.kind : null;
  }

  /** The note kind drawn at `pitch`, or null when it is not a note pitch. */
  private kindOf(pitch: number): VocalNoteKind | null {
    const classification = classifyVocalPitch(this.layout, pitch);
    return classification.type === "note" ? classification.kind : null;
  }

  /** Creates a phrase, unless it would overlap another phrase of its kind. */
  private createPhrase(
    phrase: VocalPhraseKind,
    request: VocalCreateRequest,
  ): CreatedNote | null {
    const { tick, end } = request;

    // Check before materializing the track so a rejected drag leaves the
    // document untouched.
    const pitch = vocalPhrasePitch(this.layout, phrase);
    if (
      vocalPhraseOverlaps(this.context.getSelectedTrack(), pitch, tick, end)
    ) {
      return null;
    }

    const track = this.getOrCreateTrack();
    if (!track) return null;

    const created = addVocalPhrase(track, this.layout, phrase, tick, end);
    if (!created) return null;

    return { noteOn: created.note.noteOn, needsLyric: false };
  }

  /** Creates a note of the kind chosen by the lane or the toolbar. */
  private createNote(request: VocalCreateRequest): CreatedNote | null {
    const { lane, tick, end } = request;
    const kind = this.resolveNoteKind(request);

    // Lane notes use the lane's pitch; pitched notes follow the pointer.
    const pitch =
      kind === "pitched"
        ? this.coordinates.pitchAtScreenY(
            Math.max(request.screenY, this.coordinates.getGridTop()),
          )
        : lane?.createPitch;

    const track = this.getOrCreateTrack();
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

  /** Percussion and pitchless lanes force their kind; otherwise the toolbar's. */
  private resolveNoteKind(request: VocalCreateRequest): VocalNoteKind {
    const laneKind = request.lane?.kind;

    return laneKind === "percussion" || laneKind === "pitchless"
      ? laneKind
      : request.placementKind;
  }

  /** Returns the selected track, creating the configured vocal track on edit. */
  private getOrCreateTrack(): MidiTrack | null {
    const existing = this.getTrack();
    if (existing) return existing;

    const midi = this.context.getMidi();
    const trackName = this.context.getProfile().trackName;
    if (!midi || !trackName) return null;

    return (
      new SongView(midi).getVocalTrackView(trackName)?.ensureTrack() ?? null
    );
  }

  /**
   * Chooses the horizontal move offset for this frame: the requested one when
   * every moving phrase still fits, otherwise the last one that did.
   */
  private resolveMoveTickDelta(
    track: MidiTrack,
    targets: readonly MoveTarget[],
    tickDelta: number,
  ): number {
    const phrasePlacements = targets
      .filter(({ note }) => this.phraseOf(note.pitch))
      .map(({ note, initialTick }) => ({
        note: note.midiNote,
        start: Math.max(0, initialTick + tickDelta),
        duration: note.midiNote.end - note.midiNote.start,
      }));

    if (this.phrasesFit(track, phrasePlacements)) {
      this.lastValidMoveTickDelta = tickDelta;
    }

    return this.lastValidMoveTickDelta;
  }

  /** Moves phrase targets directly in time; returns whether any moved. */
  private movePhrases(
    track: MidiTrack,
    targets: readonly MoveTarget[],
    tickDelta: number,
  ): boolean {
    const phraseTargets = targets.filter(({ note }) =>
      this.phraseOf(note.pitch),
    );

    return applyToEach(phraseTargets, ({ note, initialTick }) => {
      const start = Math.max(0, initialTick + tickDelta);
      if (note.midiNote.start === start) return false;

      return track.setNoteStart(note.midiNote, start);
    });
  }

  /** Moves non-phrase targets through the vocal model, carrying lyrics along. */
  private moveNotes(
    track: MidiTrack,
    targets: readonly MoveTarget[],
    tickDelta: number,
    pitchDelta: number,
  ): boolean {
    const moves: VocalMove[] = targets
      .filter(({ note }) => !this.phraseOf(note.pitch))
      .map(({ note, initialTick, initialPitch }) => ({
        note: note.midiNote,
        start: Math.max(0, initialTick + tickDelta),
        pitch: initialPitch + pitchDelta,
        lyric: this.moveLyrics.get(note.midiNote.noteOn) ?? null,
      }));

    return moveVocalNotes(track, this.layout, moves);
  }

  /** Auditions a lone pitched note when a move changes its pitch. */
  private previewMovedNote(targets: readonly MoveTarget[]): void {
    if (targets.length !== 1) return;
    if (this.kindOf(targets[0].note.pitch) !== "pitched") return;

    const pitch = targets[0].note.midiNote.note;
    if (pitch === this.lastPreviewPitch) return;

    this.lastPreviewPitch = pitch;
    this.preview(pitch, targets[0].note.midiNote.start);
  }

  /** True when none of the placements overlaps a stationary phrase. */
  private phrasesFit(
    track: MidiTrack,
    placements: readonly PhrasePlacement[],
  ): boolean {
    // Phrases that are being edited do not collide with their old selves.
    const moving = placements.map(({ note }) => note);

    return placements.every(
      ({ note, start, duration }) =>
        !vocalPhraseOverlaps(track, note.note, start, start + duration, moving),
    );
  }

  /** Pastes one clipboard entry; returns its note-on, or null if skipped. */
  private pasteEntry(
    track: MidiTrack,
    entry: ClipboardNote,
    anchorTick: number,
  ): MidiChannelEvent | null {
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
      return phrase?.note.noteOn ?? null;
    }

    if (classification.type === "note") {
      const note = addVocalNote(
        track,
        this.layout,
        classification.kind,
        start,
        end,
        { pitch: entry.pitch, lyric: entry.lyric, velocity: entry.velocity },
      );
      return note?.note.noteOn ?? null;
    }

    return null;
  }

  /** Auditions a pitch at `tick` for half a quarter note. */
  private preview(pitch: number, tick: number): void {
    const ppqn = this.context.getPpqn();

    // The preview only needs timing and pitch, so it has no backing MIDI note.
    this.context.previewNotes([
      {
        tick,
        durationTicks: ppqn / 2,
        pitch,
        velocity: DefaultNoteVelocity,
        midiNote: {} as MidiNote,
      },
    ]);
  }
}
