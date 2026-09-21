import type { MidiChannelEvent } from "@midiedit/core";
import { clamp } from "es-toolkit";
import type { CanvasPoint } from "../../../rendering/geometry";
import type { CoordinateSystem } from "./coordinates";
import type { PianoRollContext, PianoRollNote } from "./types";

interface ResizeTarget {
  note: PianoRollNote;
  initialDuration: number;
}

interface MoveTarget {
  note: PianoRollNote;
  initialTick: number;
  initialPitch: number;
}

interface ClipboardNote {
  relativeTick: number;
  pitch: number;
  durationTicks: number;
  velocity: number;
}

export function remapNotesByIdentity(
  notes: PianoRollNote[],
  keep: Set<MidiChannelEvent>,
): PianoRollNote[] {
  return notes.filter((note) => keep.has(note.midiNote.noteOn));
}

/** Model commands for notes, selection remapping, and clipboard actions. */
export class NoteEditingController {
  private readonly context: PianoRollContext;
  private readonly coordinates: CoordinateSystem;

  private resizing = false;
  private resizeAnchor: PianoRollNote | null = null;
  private resizeAnchorInitialEnd = 0;
  private resizeTargets: ResizeTarget[] = [];
  private lastResizeDelta = 0;
  private resizeSelectionKeep = new Set<MidiChannelEvent>();

  private creating = false;
  private moving = false;
  private moveAnchor: PianoRollNote | null = null;
  private moveAnchorInitialTick = 0;
  private moveAnchorInitialPitch = 0;
  private moveTargets: MoveTarget[] = [];
  private moveSelectionKeep = new Set<MidiChannelEvent>();

  private clipboard: ClipboardNote[] = [];

  private get isNoteEditingLocked(): boolean {
    return this.context.getState().isPlaying;
  }

  public constructor(context: PianoRollContext, coordinates: CoordinateSystem) {
    this.context = context;
    this.coordinates = coordinates;
  }

  public get isResizing(): boolean {
    return this.resizing;
  }

  public get isMoving(): boolean {
    return this.moving;
  }

  public get isCreating(): boolean {
    return this.creating;
  }

  public beginResize(anchor: PianoRollNote): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    const selection = this.context.getSelectionContext();
    const targets =
      selection.isSelected(anchor) && selection.size > 0
        ? selection.notes
        : [anchor];

    this.resizing = true;
    this.resizeAnchor = anchor;
    this.resizeAnchorInitialEnd = anchor.tick + anchor.durationTicks;
    this.resizeTargets = targets.map((note) => ({
      note,
      initialDuration: note.durationTicks,
    }));
    this.resizeSelectionKeep = new Set(
      selection.notes.map((note) => note.midiNote.noteOn),
    );
  }

  public updateResize(local: CanvasPoint): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    const track = this.context.getSelectedTrack();
    if (!track || !this.resizeAnchor) {
      return;
    }

    const snappedEnd = this.coordinates.snapTickToNearest(
      this.coordinates.tickAtScreenX(local.x),
    );
    const newAnchorEnd = Math.max(this.resizeAnchor.tick + 1, snappedEnd);
    const delta = newAnchorEnd - this.resizeAnchorInitialEnd;
    this.lastResizeDelta = delta;

    for (const { note, initialDuration } of this.resizeTargets) {
      track.setNoteDuration(
        note.midiNote,
        Math.max(1, initialDuration + delta),
      );
    }

    this.remapSelection(this.resizeSelectionKeep);
    this.context.notifyNotesChanged();
    this.context.requestRender();
  }

  public beginMove(anchor: PianoRollNote): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    const selection = this.context.getSelectionContext();
    if (!selection.isSelected(anchor) || selection.size === 0) {
      selection.notes = [anchor];
    }

    this.moving = true;
    this.moveAnchor = anchor;
    this.moveAnchorInitialTick = anchor.tick;
    this.moveAnchorInitialPitch = anchor.pitch;
    this.moveTargets = selection.notes.map((note) => ({
      note,
      initialTick: note.tick,
      initialPitch: note.pitch,
    }));
    this.moveSelectionKeep = new Set(
      selection.notes.map((note) => note.midiNote.noteOn),
    );
  }

  public updateMove(local: CanvasPoint): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    const track = this.context.getSelectedTrack();
    if (!track || !this.moveAnchor) {
      return;
    }

    const newAnchorTick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(local.x),
    );
    const newAnchorPitch = this.coordinates.pitchAtScreenY(local.y);
    const tickDelta = newAnchorTick - this.moveAnchorInitialTick;
    const pitchDelta = newAnchorPitch - this.moveAnchorInitialPitch;

    for (const { note, initialTick, initialPitch } of this.moveTargets) {
      track.setNoteStart(note.midiNote, Math.max(0, initialTick + tickDelta));
      track.setNotePitch(
        note.midiNote,
        clamp(initialPitch + pitchDelta, 0, 127),
      );
    }

    this.remapSelection(this.moveSelectionKeep);
    this.context.notifyNotesChanged();
    this.context.requestRender();
  }

  public finishGesture(): void {
    if (this.isNoteEditingLocked) {
      this.cancelGesture();
      return;
    }

    const track = this.context.getSelectedTrack();
    const target = this.resizeTargets[0];
    if (this.creating && track && target) {
      const currentDuration = Math.max(
        1,
        target.initialDuration + this.lastResizeDelta,
      );
      if (currentDuration < 1) {
        track.setNoteDuration(target.note.midiNote, 1);
        this.remapSelection(this.resizeSelectionKeep);
      }
    }

    this.creating = false;
    this.resizing = false;
    this.resizeAnchor = null;
    this.resizeTargets = [];
    this.lastResizeDelta = 0;
    this.resizeSelectionKeep = new Set();
    this.moving = false;
    this.moveAnchor = null;
    this.moveTargets = [];
    this.moveSelectionKeep = new Set();
  }

  public cancelGesture(): void {
    this.creating = false;
    this.resizing = false;
    this.resizeAnchor = null;
    this.resizeTargets = [];
    this.resizeSelectionKeep = new Set();
    this.moving = false;
    this.moveAnchor = null;
    this.moveTargets = [];
    this.moveSelectionKeep = new Set();
  }

  public beginCreate(local: CanvasPoint): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    const track = this.context.getSelectedTrack();
    if (!track) {
      return;
    }

    const pitch = this.coordinates.pitchAtScreenY(local.y);
    const tick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(local.x),
    );
    const insertAt = track.getInsertionIndexAt(tick);
    const startDelta = tick - track.getAbsoluteTickAt(insertAt);
    const { noteOn } = track.addNote(pitch, startDelta, 100, 1, insertAt);
    this.context.notifyNotesChanged();
    this.remapSelection(new Set([noteOn]));

    const anchor = this.context.getSelectionContext().notes[0];
    if (!anchor) {
      return;
    }

    this.creating = true;
    this.resizing = true;
    this.resizeAnchor = anchor;
    this.resizeAnchorInitialEnd = anchor.tick + anchor.durationTicks;
    this.resizeTargets = [
      { note: anchor, initialDuration: anchor.durationTicks },
    ];
    this.resizeSelectionKeep = new Set([noteOn]);
    this.context.requestRender();
  }

  public eraseNote(note: PianoRollNote): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    const track = this.context.getSelectedTrack();
    if (!track) {
      return;
    }

    const selection = this.context.getSelectionContext();
    const keep = new Set(
      selection.notes
        .filter((selected) => selected !== note)
        .map((selected) => selected.midiNote.noteOn),
    );
    track.removeNote(note.midiNote.noteOn, note.midiNote.noteOff);
    this.context.notifyNotesChanged();
    this.remapSelection(keep);
    this.context.requestRender();
  }

  public deleteSelection(): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    const track = this.context.getSelectedTrack();
    const selection = this.context.getSelectionContext();
    if (!track || selection.size === 0) {
      return;
    }

    for (const note of selection.notes) {
      track.removeNote(note.midiNote.noteOn, note.midiNote.noteOff);
    }
    this.context.notifyNotesChanged();
    selection.clear();
    this.context.requestRender();
  }

  public transposeSelection(semitones: number): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    const track = this.context.getSelectedTrack();
    const selection = this.context.getSelectionContext();
    if (!track || selection.size === 0) {
      return;
    }

    const keep = new Set(selection.notes.map((note) => note.midiNote.noteOn));
    for (const note of selection.notes) {
      track.setNotePitch(note.midiNote, clamp(note.pitch + semitones, 0, 127));
    }
    this.remapSelection(keep);
    this.context.notifyNotesChanged();
    this.context.requestRender();
  }

  public moveSelectionTicks(deltaTicks: number): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    const track = this.context.getSelectedTrack();
    const selection = this.context.getSelectionContext();
    if (!track || selection.size === 0) {
      return;
    }

    const keep = new Set(selection.notes.map((note) => note.midiNote.noteOn));
    for (const note of selection.notes) {
      track.setNoteStart(
        note.midiNote,
        Math.max(0, Math.round(note.tick + deltaTicks)),
      );
    }
    this.remapSelection(keep);
    this.context.notifyNotesChanged();
    this.context.requestRender();
  }

  public copySelection(): void {
    const selection = this.context.getSelectionContext();
    if (selection.size === 0) {
      return;
    }

    const notes = selection.notes;
    const minTick = Math.min(...notes.map((note) => note.tick));
    this.clipboard = notes.map((note) => ({
      relativeTick: note.tick - minTick,
      pitch: note.pitch,
      durationTicks: note.durationTicks,
      velocity: note.velocity,
    }));
  }

  public cutSelection(): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    const track = this.context.getSelectedTrack();
    const selection = this.context.getSelectionContext();
    if (!track || selection.size === 0) {
      return;
    }

    this.copySelection();
    for (const note of selection.notes) {
      track.removeNote(note.midiNote.noteOn, note.midiNote.noteOff);
    }
    this.context.notifyNotesChanged();
    this.remapSelection(new Set());
    this.context.requestRender();
  }

  public pasteClipboard(anchorX: number, hasHovered: boolean): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    const track = this.context.getSelectedTrack();
    if (!track || this.clipboard.length === 0) {
      return;
    }

    const x = hasHovered ? anchorX : this.context.getKeyboardWidth();
    const anchorTick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(x),
    );
    const pastedNoteOns = new Set<MidiChannelEvent>();

    for (const entry of this.clipboard) {
      const tick = Math.max(0, anchorTick + entry.relativeTick);
      const insertAt = track.getInsertionIndexAt(tick);
      const startDelta = tick - track.getAbsoluteTickAt(insertAt);
      const { noteOn } = track.addNote(
        entry.pitch,
        startDelta,
        entry.velocity,
        entry.durationTicks,
        insertAt,
      );
      pastedNoteOns.add(noteOn);
    }
    this.context.notifyNotesChanged();
    this.remapSelection(pastedNoteOns);
    this.context.requestRender();
  }

  public remapSelection(keep: Set<MidiChannelEvent>): void {
    const midi = this.context.getMidi();
    const state = this.context.getState();
    if (!midi || state.selectedTrackIndex === null || keep.size === 0) {
      this.context.getSelectionContext().clear();
      return;
    }

    const mapped = this.context.getTrackNotes(midi, state.selectedTrackIndex);
    this.context.getSelectionContext().notes = remapNotesByIdentity(
      mapped,
      keep,
    );
  }
}
