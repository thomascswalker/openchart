import type { MidiChannelEvent } from "@openchart/midi";
import { Vector2 } from "three";
import type { CoordinateSystem } from "../coordinates";
import {
  NoteEditingStrategy,
  type ClipboardNote,
  type MoveTarget,
  type IEditingStrategy,
  type ResizeTarget,
} from "../editingStrategy";
import type { PianoRollContext, PianoRollNote } from "../types";
import { VocalEditingStrategy } from "../vocalEditing";
import { KeyboardWidth } from "../constants";
import type { PianoRollEditingType } from "../profile";

export function remapNotesByIdentity(
  notes: PianoRollNote[],
  keep: Set<MidiChannelEvent>,
): PianoRollNote[] {
  return notes.filter((note) => keep.has(note.midiNote.noteOn));
}

/**
 * Gesture state, selection remapping, history bracketing and clipboard for
 * the Piano Roll. What each gesture does to the MIDI data is delegated to
 * the profile's editing strategy (generic or vocal).
 */
export class NoteEditingController {
  private readonly context: PianoRollContext;
  private readonly coordinates: CoordinateSystem;
  private readonly strategies: Record<PianoRollEditingType, IEditingStrategy>;

  private resizing = false;
  private resizeAnchor: PianoRollNote | null = null;
  private resizeAnchorInitialEnd = 0;
  private resizeTargets: ResizeTarget[] = [];
  private resizeSelectionKeep = new Set<MidiChannelEvent>();
  private gestureTransactionOpen = false;

  private creating = false;
  private moving = false;
  private moveAnchor: PianoRollNote | null = null;
  private moveAnchorInitialTick = 0;
  private moveAnchorInitialPitch = 0;
  private moveTargets: MoveTarget[] = [];
  private moveSelectionKeep = new Set<MidiChannelEvent>();

  /** A just-created vocal note waiting for its lyric (transaction open). */
  private pendingLyric: MidiChannelEvent | null = null;
  private awaitingLyric = false;

  private clipboard: ClipboardNote[] = [];

  private get isNoteEditingLocked(): boolean {
    return this.context.getState().isPlaying;
  }

  public constructor(context: PianoRollContext, coordinates: CoordinateSystem) {
    this.context = context;
    this.coordinates = coordinates;
    this.strategies = {
      generic: new NoteEditingStrategy(context, coordinates),
      vocals: new VocalEditingStrategy(context, coordinates),
    };
  }

  private get strategy(): IEditingStrategy {
    return this.strategies[this.context.getProfile().editing];
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

  /** True while the lyric prompt for a new note is open. */
  public get isAwaitingLyric(): boolean {
    return this.awaitingLyric;
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
    this.beginGestureTransaction();
  }

  public updateResize(local: Vector2): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    if (!this.strategy.getTrack(false) || !this.resizeAnchor) {
      return;
    }

    const snappedEnd = this.coordinates.snapTickToNearest(
      this.coordinates.tickAtScreenX(local.x),
    );
    const newAnchorEnd = Math.max(this.resizeAnchor.tick + 1, snappedEnd);
    const delta = newAnchorEnd - this.resizeAnchorInitialEnd;

    const changed = this.strategy.resize(this.resizeTargets, delta);

    this.remapSelection(this.resizeSelectionKeep);
    if (changed) this.context.notifyNotesChanged();
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
    this.strategy.beginMove(this.moveTargets);
    this.beginGestureTransaction();
  }

  public updateMove(local: Vector2): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    if (!this.strategy.getTrack(false) || !this.moveAnchor) {
      return;
    }

    const newAnchorTick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(local.x),
    );
    const newAnchorPitch = this.coordinates.pitchAtScreenY(local.y);
    const tickDelta = newAnchorTick - this.moveAnchorInitialTick;
    const pitchDelta = newAnchorPitch - this.moveAnchorInitialPitch;

    const changed = this.strategy.move(this.moveTargets, tickDelta, pitchDelta);

    this.remapSelection(this.moveSelectionKeep);
    if (changed) this.context.notifyNotesChanged();
    this.context.requestRender();
  }

  public finishGesture(): void {
    if (this.isNoteEditingLocked) {
      this.cancelGesture();
      return;
    }

    const lyricNote = this.creating ? this.pendingLyric : null;
    this.resetGestureState();
    if (lyricNote) {
      // Keep the transaction open: the note and its lyric become one history
      // entry, and Escape rolls both back.
      this.openLyricPrompt(lyricNote);
      return;
    }
    this.endGestureTransaction();
  }

  public cancelGesture(): void {
    this.resetGestureState();
    if (this.awaitingLyric) {
      // Closing the prompt runs its onCancel, which rolls the create back.
      this.context.cancelLyricPrompt();
      if (this.awaitingLyric) this.rollbackPendingCreate();
      return;
    }
    this.pendingLyric = null;
    this.endGestureTransaction();
  }

  private resetGestureState(): void {
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

  public beginCreate(local: Vector2): void {
    if (this.isNoteEditingLocked || this.awaitingLyric) {
      return;
    }
    if (!this.strategy.getTrack(true)) {
      return;
    }

    this.beginGestureTransaction();
    const created = this.strategy.create(local);
    if (!created) {
      this.endGestureTransaction();
      return;
    }
    const { noteOn } = created;
    this.pendingLyric = created.needsLyric ? noteOn : null;
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

  private openLyricPrompt(noteOn: MidiChannelEvent): void {
    const note = this.strategy
      .getTrack(false)
      ?.getNotes()
      .find((item) => item.noteOn === noteOn);
    if (!note) {
      this.pendingLyric = null;
      this.endGestureTransaction();
      return;
    }
    this.awaitingLyric = true;
    this.context.promptLyric(note.start, {
      onCommit: (text) => this.commitPendingLyric(text),
      onCancel: () => this.rollbackPendingCreate(),
      onTab: (text) => {
        const tick = note.start;
        if (this.commitPendingLyric(text)) this.context.editNextLyric(tick);
        else this.rollbackPendingCreate();
      },
    });
  }

  /** Writes the new note's lyric and closes the create transaction. */
  public commitPendingLyric(text: string): boolean {
    const noteOn = this.pendingLyric;
    if (!noteOn || !this.awaitingLyric || !text.trim()) return false;
    if (!this.strategy.setLyric?.(noteOn, text)) return false;
    this.pendingLyric = null;
    this.awaitingLyric = false;
    this.context.notifyNotesChanged();
    this.endGestureTransaction();
    this.context.requestRender();
    return true;
  }

  /**
   * Escape (or empty text): undo the note, the lyric-less track creation and
   * every resize step in one go by restoring the pre-transaction document.
   */
  public rollbackPendingCreate(): void {
    const noteOn = this.pendingLyric;
    if (!this.awaitingLyric) return;
    this.pendingLyric = null;
    this.awaitingLyric = false;
    this.context.getSelectionContext().clear();
    if (this.gestureTransactionOpen && this.context.rollbackEdit()) {
      this.gestureTransactionOpen = false;
    } else {
      // No history service (e.g. Storybook): remove the note by hand.
      const track = this.strategy.getTrack(false);
      const note = track?.getNotes().find((item) => item.noteOn === noteOn);
      if (note) {
        this.strategy.remove([
          {
            tick: note.start,
            durationTicks: note.end - note.start,
            pitch: note.note,
            velocity: note.velocity,
            midiNote: note,
          },
        ]);
        this.context.notifyNotesChanged();
      }
      this.endGestureTransaction();
    }
    this.context.requestRender();
  }

  private beginGestureTransaction(): void {
    if (this.gestureTransactionOpen) return;
    this.gestureTransactionOpen = true;
    this.context.beginEdit();
  }

  private endGestureTransaction(): void {
    if (!this.gestureTransactionOpen) return;
    this.gestureTransactionOpen = false;
    this.context.endEdit();
  }

  public eraseNote(note: PianoRollNote): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    if (!this.strategy.getTrack(false)) {
      return;
    }

    const selection = this.context.getSelectionContext();
    const keep = new Set(
      selection.notes
        .filter((selected) => selected !== note)
        .map((selected) => selected.midiNote.noteOn),
    );
    this.strategy.remove([note]);
    this.context.notifyNotesChanged();
    this.remapSelection(keep);
    this.context.requestRender();
  }

  public deleteSelection(): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    const selection = this.context.getSelectionContext();
    if (!this.strategy.getTrack(false) || selection.size === 0) {
      return;
    }

    this.strategy.remove(selection.notes);
    this.context.notifyNotesChanged();
    selection.clear();
    this.context.requestRender();
  }

  public transposeSelection(semitones: number): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    const selection = this.context.getSelectionContext();
    if (!this.strategy.getTrack(false) || selection.size === 0) {
      return;
    }

    const keep = new Set(selection.notes.map((note) => note.midiNote.noteOn));
    this.strategy.transpose(selection.notes, semitones);
    this.remapSelection(keep);
    this.context.notifyNotesChanged();
    this.context.requestRender();
  }

  public moveSelectionTicks(deltaTicks: number): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    const selection = this.context.getSelectionContext();
    if (!this.strategy.getTrack(false) || selection.size === 0) {
      return;
    }

    const keep = new Set(selection.notes.map((note) => note.midiNote.noteOn));
    this.strategy.shift(selection.notes, deltaTicks);
    this.remapSelection(keep);
    this.context.notifyNotesChanged();
    this.context.requestRender();
  }

  public copySelection(): void {
    const selection = this.context.getSelectionContext();
    if (selection.size === 0) {
      return;
    }
    this.clipboard = this.strategy.copy(selection.notes);
  }

  public canCopySelection(): boolean {
    return this.context.getSelectionContext().size > 0;
  }

  public canCutSelection(): boolean {
    return !this.isNoteEditingLocked && this.canCopySelection();
  }

  public canPasteClipboard(): boolean {
    return !this.isNoteEditingLocked && this.clipboard.length > 0;
  }

  public cutSelection(): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    const selection = this.context.getSelectionContext();
    if (!this.strategy.getTrack(false) || selection.size === 0) {
      return;
    }

    this.copySelection();
    this.strategy.remove(selection.notes);
    this.context.notifyNotesChanged();
    this.remapSelection(new Set());
    this.context.requestRender();
  }

  public pasteClipboard(anchorX: number, hasHovered: boolean): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    if (
      !this.strategy.getTrack(this.strategy.id === "vocal") ||
      this.clipboard.length === 0
    ) {
      return;
    }

    const x = hasHovered ? anchorX : KeyboardWidth;
    const anchorTick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(x),
    );
    const pastedNoteOns = new Set(
      this.strategy.paste(this.clipboard, anchorTick),
    );
    this.context.notifyNotesChanged();
    this.remapSelection(pastedNoteOns);
    this.context.requestRender();
  }

  public remapSelection(keep: Set<MidiChannelEvent>): void {
    const midi = this.context.getMidi();
    const trackIndex = this.context.getSelectedTrackIndex();
    if (!midi || trackIndex === null || keep.size === 0) {
      this.context.getSelectionContext().clear();
      return;
    }

    const mapped = this.context.getTrackNotes(midi, trackIndex);
    this.context.getSelectionContext().notes = remapNotesByIdentity(
      mapped,
      keep,
    );
  }
}
