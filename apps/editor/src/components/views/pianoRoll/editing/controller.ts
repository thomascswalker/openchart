import type { MidiChannelEvent } from "@openchart/core";
import type { Vector2 } from "three";
import { KeyboardWidth } from "../constants";
import type { CoordinateSystem } from "../coordinates";
import { DefaultEditContext } from "./default";
import type { IEditContext } from "./context";
import {
  type ClipboardNote,
  type MoveTarget,
  type ResizeTarget,
  type EditMode,
} from "./types";
import { toPianoRollNote } from "../noteData";
import type { PianoRollContext, PianoRollNote } from "../types";
import { VocalEditContext } from "./vocals";

/** State of an active resize (or the drag that follows creating a note). */
interface ResizeGesture {
  /** Note under the pointer; its end follows the pointer. */
  anchor: PianoRollNote;

  /** End tick of the anchor when the gesture began. */
  anchorInitialEnd: number;

  /** Every note being resized together. */
  targets: ResizeTarget[];

  /** Note-ons to reselect after each edit rebuilds the note objects. */
  selectionKeep: Set<MidiChannelEvent>;
}

/** State of an active move. */
interface MoveGesture {
  /** Note under the pointer; the move follows its position. */
  anchor: PianoRollNote;

  /** Start tick of the anchor when the gesture began. */
  anchorInitialTick: number;

  /** Pitch of the anchor when the gesture began. */
  anchorInitialPitch: number;

  /** Every note being moved together. */
  targets: MoveTarget[];

  /** Note-ons to reselect after each edit rebuilds the note objects. */
  selectionKeep: Set<MidiChannelEvent>;
}

/** Keeps the notes whose note-on is in `keep`, preserving order. */
export function remapNotesByIdentity(
  notes: PianoRollNote[],
  keep: Set<MidiChannelEvent>,
): PianoRollNote[] {
  return notes.filter((note) => keep.has(note.midiNote.noteOn));
}

/**
 * Gesture state, selection remapping, history bracketing and clipboard for
 * the Piano Roll. What each gesture does to the MIDI data is delegated to
 * the profile's editing edit context (default or vocal).
 */
export class NoteEditingController {
  /** Supplies selection, document state and edit transactions. */
  private readonly context: PianoRollContext;

  /** Converts canvas positions to ticks, pitches and snapped values. */
  private readonly coordinates: CoordinateSystem;

  /** One edit context per editing mode; the profile picks which is active. */
  private readonly modes: Record<EditMode, IEditContext>;

  /** The resize in progress, or null. */
  private resizeGesture: ResizeGesture | null = null;

  /** The move in progress, or null. */
  private moveGesture: MoveGesture | null = null;

  /** True while the drag that follows creating a note is in progress. */
  private creating = false;

  /** True while a history transaction opened by a gesture is still open. */
  private gestureTransactionOpen = false;

  /** A just-created vocal note waiting for its lyric (transaction open). */
  private pendingLyric: MidiChannelEvent | null = null;

  /** True while the lyric prompt for a new note is open. */
  private awaitingLyric = false;

  /** Notes copied or cut, ready to paste. */
  private clipboard: ClipboardNote[] = [];

  public constructor(context: PianoRollContext, coordinates: CoordinateSystem) {
    this.context = context;
    this.coordinates = coordinates;
    this.modes = {
      default: new DefaultEditContext(context, coordinates),
      vocal: new VocalEditContext(context, coordinates),
    };
  }

  /** True while a resize gesture is in progress. */
  public get isResizing(): boolean {
    return this.resizeGesture !== null;
  }

  /** True while a move gesture is in progress. */
  public get isMoving(): boolean {
    return this.moveGesture !== null;
  }

  /** True while a newly created note is being dragged out. */
  public get isCreating(): boolean {
    return this.creating;
  }

  /** True while the lyric prompt for a new note is open. */
  public get isAwaitingLyric(): boolean {
    return this.awaitingLyric;
  }

  /** Starts resizing `anchor`, together with the selection if it is part of it. */
  public beginResize(anchor: PianoRollNote): void {
    if (this.isNoteEditingLocked) return;

    const selection = this.context.getSelectionContext();
    const targets =
      selection.isSelected(anchor) && selection.size > 0
        ? selection.notes
        : [anchor];

    this.resizeGesture = this.createResizeGesture(
      anchor,
      targets,
      this.selectedNoteOns(),
    );
    this.beginGestureTransaction();
  }

  /** Resizes the targets so the anchor's end follows the pointer. */
  public updateResize(local: Vector2): void {
    const gesture = this.resizeGesture;
    if (!this.canEditTrack || !gesture) return;

    // New end of the anchor: snapped to the grid and at least one tick long.
    const snappedEnd = this.coordinates.snapTickToNearest(
      this.coordinates.tickAtScreenX(local.x),
    );
    const newAnchorEnd = Math.max(gesture.anchor.tick + 1, snappedEnd);
    const delta = newAnchorEnd - gesture.anchorInitialEnd;

    const changed = this.editContext.resize(gesture.targets, delta);

    this.remapSelection(gesture.selectionKeep);
    if (changed) this.context.notifyNotesChanged();
    this.context.requestRender();
  }

  /** Starts moving `anchor`, selecting it first if it is not selected. */
  public beginMove(anchor: PianoRollNote): void {
    if (this.isNoteEditingLocked) return;

    const selection = this.context.getSelectionContext();
    if (!selection.isSelected(anchor) || selection.size === 0) {
      selection.notes = [anchor];
    }

    // Remember where every note started so each frame is an offset from it.
    const targets = selection.notes.map((note) => ({
      note,
      initialTick: note.tick,
      initialPitch: note.pitch,
    }));
    this.moveGesture = {
      anchor,
      anchorInitialTick: anchor.tick,
      anchorInitialPitch: anchor.pitch,
      targets,
      selectionKeep: this.selectedNoteOns(),
    };

    this.editContext.beginMove(targets);
    this.beginGestureTransaction();
  }

  /** Moves the targets so the anchor follows the pointer. */
  public updateMove(local: Vector2): void {
    const gesture = this.moveGesture;
    if (!this.canEditTrack || !gesture) return;

    // Offset of the anchor from where it started, snapped to the grid.
    const newAnchorTick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(local.x),
    );
    const newAnchorPitch = this.coordinates.pitchAtScreenY(local.y);
    const tickDelta = newAnchorTick - gesture.anchorInitialTick;
    const pitchDelta = newAnchorPitch - gesture.anchorInitialPitch;

    const changed = this.editContext.move(
      gesture.targets,
      tickDelta,
      pitchDelta,
    );

    this.remapSelection(gesture.selectionKeep);
    if (changed) this.context.notifyNotesChanged();
    this.context.requestRender();
  }

  /**
   * Ends the active gesture. A newly created vocal note keeps its transaction
   * open and asks for its lyric; every other gesture closes its transaction.
   */
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

  /** Abandons the active gesture, rolling back a note awaiting its lyric. */
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

  /**
   * Creates a note at `local` and turns the gesture into a drag that sets its
   * length. Does nothing during playback or while a lyric is awaited.
   */
  public beginCreate(local: Vector2): void {
    if (this.isNoteEditingLocked) {
      return;
    }
    if (this.awaitingLyric) {
      return;
    }

    const track = this.editContext.getTrack();
    if (track === null && !this.editContext.canCreateTrack()) {
      return;
    }

    this.beginGestureTransaction();
    const created = this.editContext.create(local);
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

    // Continue as a resize so dragging stretches the new note.
    this.creating = true;
    this.resizeGesture = this.createResizeGesture(
      anchor,
      [anchor],
      new Set([noteOn]),
    );
    this.context.requestRender();
  }

  /** Writes the new note's lyric and closes the create transaction. */
  public commitPendingLyric(text: string): boolean {
    const noteOn = this.pendingLyric;
    if (!noteOn || !this.awaitingLyric || !text.trim()) return false;
    if (!this.editContext.setLyric?.(noteOn, text)) return false;

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
    if (!this.awaitingLyric) return;

    const noteOn = this.pendingLyric;
    this.pendingLyric = null;
    this.awaitingLyric = false;
    this.context.getSelectionContext().clear();

    if (this.gestureTransactionOpen && this.context.rollbackEdit()) {
      this.gestureTransactionOpen = false;
    } else {
      this.removeNoteByHand(noteOn);
      this.endGestureTransaction();
    }

    this.context.requestRender();
  }

  /** Deletes one note, keeping the rest of the selection. */
  public eraseNote(note: PianoRollNote): void {
    if (!this.canEditTrack) return;

    const keep = new Set(
      this.context
        .getSelectionContext()
        .notes.filter((selected) => selected !== note)
        .map((selected) => selected.midiNote.noteOn),
    );

    this.editContext.remove([note]);
    this.context.notifyNotesChanged();
    this.remapSelection(keep);
    this.context.requestRender();
  }

  /** Deletes every selected note and clears the selection. */
  public deleteSelection(): void {
    if (!this.hasEditableSelection) return;

    const selection = this.context.getSelectionContext();

    this.editContext.remove(selection.notes);
    this.context.notifyNotesChanged();
    selection.clear();
    this.context.requestRender();
  }

  /** Shifts the pitch of the selected notes by `semitones`. */
  public transposeSelection(semitones: number): void {
    if (!this.hasEditableSelection) return;

    const keep = this.selectedNoteOns();

    const { notes } = this.context.getSelectionContext();

    this.editContext.transpose(notes, semitones);
    this.remapSelection(keep);
    this.context.notifyNotesChanged();
    this.context.requestRender();
  }

  /** Shifts the selected notes in time by `deltaTicks`. */
  public moveSelectionTicks(deltaTicks: number): void {
    if (!this.hasEditableSelection) return;

    const keep = this.selectedNoteOns();

    this.editContext.shift(
      this.context.getSelectionContext().notes,
      deltaTicks,
    );
    this.remapSelection(keep);
    this.context.notifyNotesChanged();
    this.context.requestRender();
  }

  /** Copies the selected notes to the clipboard. */
  public copySelection(): void {
    const selection = this.context.getSelectionContext();
    if (selection.size === 0) return;

    this.clipboard = this.editContext.copy(selection.notes);
  }

  /** True when there is a selection to copy. */
  public canCopySelection(): boolean {
    return this.context.getSelectionContext().size > 0;
  }

  /** True when the selection can be cut (copyable and not playing). */
  public canCutSelection(): boolean {
    return !this.isNoteEditingLocked && this.canCopySelection();
  }

  /** True when the clipboard has notes and editing is allowed. */
  public canPasteClipboard(): boolean {
    return !this.isNoteEditingLocked && this.clipboard.length > 0;
  }

  /** Copies the selected notes, then deletes them. */
  public cutSelection(): void {
    if (!this.hasEditableSelection) return;

    const selection = this.context.getSelectionContext();

    this.copySelection();
    this.editContext.remove(selection.notes);
    this.context.notifyNotesChanged();
    this.remapSelection(new Set());
    this.context.requestRender();
  }

  /**
   * Pastes the clipboard with its first note at the snapped tick under
   * `anchorX`, or at the left edge of the roll when `anchorX` is null.
   */
  public pasteClipboard(anchorX: number | null): void {
    if (this.isNoteEditingLocked) return;
    if (!this.editContext.getTrack() && !this.editContext.canCreateTrack()) {
      return;
    }
    if (this.clipboard.length === 0) return;

    const anchorTick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(anchorX ?? KeyboardWidth),
    );
    const pastedNoteOns = new Set(
      this.editContext.paste(this.clipboard, anchorTick),
    );

    this.context.notifyNotesChanged();
    this.remapSelection(pastedNoteOns);
    this.context.requestRender();
  }

  /**
   * Reselects the notes whose note-on is in `keep`, using the current note
   * objects. Clears the selection when there is nothing to keep.
   */
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

  /** True during playback, when note editing is disabled. */
  private get isNoteEditingLocked(): boolean {
    return this.context.getState().isPlaying;
  }

  /** The edit context for the active profile's editing mode. */
  private get editContext(): IEditContext {
    return this.modes[this.context.getProfile().editing];
  }

  /** True when editing is allowed and there is a track to edit. */
  private get canEditTrack(): boolean {
    return !this.isNoteEditingLocked && Boolean(this.editContext.getTrack());
  }

  /** True when the track is editable and at least one note is selected. */
  private get hasEditableSelection(): boolean {
    return this.canEditTrack && this.context.getSelectionContext().size > 0;
  }

  /** Note-on events of the current selection, which survive note remapping. */
  private selectedNoteOns(): Set<MidiChannelEvent> {
    return new Set(
      this.context
        .getSelectionContext()
        .notes.map((note) => note.midiNote.noteOn),
    );
  }

  /** Builds resize state for `targets`, measured from their current length. */
  private createResizeGesture(
    anchor: PianoRollNote,
    targets: PianoRollNote[],
    selectionKeep: Set<MidiChannelEvent>,
  ): ResizeGesture {
    return {
      anchor,
      anchorInitialEnd: anchor.tick + anchor.durationTicks,
      targets: targets.map((note) => ({
        note,
        initialDuration: note.durationTicks,
      })),
      selectionKeep,
    };
  }

  /** Forgets resize, move and create state without touching transactions. */
  private resetGestureState(): void {
    this.creating = false;
    this.resizeGesture = null;
    this.moveGesture = null;
  }

  /** Prompts for the lyric of the note just created; gives up if it vanished. */
  private openLyricPrompt(noteOn: MidiChannelEvent): void {
    const note = this.editContext
      .getTrack()
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
        if (this.commitPendingLyric(text)) {
          this.context.editNextLyric(tick);
        } else {
          this.rollbackPendingCreate();
        }
      },
    });
  }

  /** Fallback rollback for hosts without history: removes the note directly. */
  private removeNoteByHand(noteOn: MidiChannelEvent | null): void {
    const note = this.editContext
      .getTrack()
      ?.getNotes()
      .find((item) => item.noteOn === noteOn);
    if (!note) return;

    this.editContext.remove([toPianoRollNote(note)]);
    this.context.notifyNotesChanged();
  }

  /** Opens the history transaction for the gesture, once. */
  private beginGestureTransaction(): void {
    if (this.gestureTransactionOpen) return;

    this.gestureTransactionOpen = true;
    this.context.beginEdit();
  }

  /** Closes the gesture's history transaction, if open. */
  private endGestureTransaction(): void {
    if (!this.gestureTransactionOpen) return;

    this.gestureTransactionOpen = false;
    this.context.endEdit();
  }
}
