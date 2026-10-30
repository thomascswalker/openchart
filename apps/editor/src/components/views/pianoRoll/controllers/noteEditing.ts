import {
  DomainCommandType,
  GeneralCommandType,
  EditingModeId,
  type EditCommand,
  type EntityId,
  type EditingSession,
  type EditResult,
  type GestureHandle,
  type PreviewState,
  VocalNoteKind,
  type VocalPhraseKind,
} from "@openchart/views";
import { Vector2 } from "three";
import type { CoordinateSystem } from "../coordinates";
import type { PianoRollContext, PianoRollNote } from "../types";

interface CreateSpec {
  tick: number;
  endTick: number;
  pitch: number | undefined;
  kind: VocalNoteKind | undefined;
  phraseKind: VocalPhraseKind | undefined;
}

interface ModeCommandBuilder {
  move(
    targetIds: readonly EntityId[],
    tickDelta: number,
    pitchDelta: number,
    previousValidTickDelta: number,
  ): EditCommand;
  resize(targetIds: readonly EntityId[], durationDelta: number): EditCommand;
  create(
    spec: CreateSpec,
    session: EditingSession,
    lyric?: string,
  ): EditCommand;
  delete(targetIds: readonly EntityId[]): EditCommand;
}

const COMMAND_BUILDERS: ReadonlyMap<EditingModeId, ModeCommandBuilder> =
  new Map([
    [
      EditingModeId.MidiRaw,
      {
        move: (targetIds, tickDelta, pitchDelta) => ({
          type: GeneralCommandType.MoveNotes,
          targetIds,
          tickDelta,
          pitchDelta,
        }),
        resize: (targetIds, durationDelta) => ({
          type: GeneralCommandType.ResizeNotes,
          targetIds,
          durationDelta,
        }),
        create: (spec, session) => ({
          type: GeneralCommandType.AddNotes,
          notes: [
            {
              trackIndex: session.target.trackIndex ?? 0,
              tick: spec.tick,
              pitch: spec.pitch ?? 0,
              duration: Math.max(1, spec.endTick - spec.tick),
            },
          ],
        }),
        delete: (targetIds) => ({
          type: GeneralCommandType.DeleteEntities,
          targetIds,
        }),
      },
    ],
    [
      EditingModeId.MidiVocals,
      {
        move: (targetIds, tickDelta, pitchDelta, previousValidTickDelta) => ({
          type: DomainCommandType.MoveVocalEntities,
          targetIds,
          tickDelta,
          pitchDelta,
          previousValidTickDelta,
        }),
        resize: (targetIds, durationDelta) => ({
          type: DomainCommandType.ResizeVocalEntities,
          targetIds,
          durationDelta,
        }),
        create: (spec, _session, lyric) =>
          spec.phraseKind
            ? {
                type: DomainCommandType.CreateVocalPhrase,
                phraseKind: spec.phraseKind,
                startTick: spec.tick,
                endTick: spec.endTick,
              }
            : {
                type: DomainCommandType.AddVocalNote,
                kind: spec.kind ?? VocalNoteKind.Pitched,
                tick: spec.tick,
                endTick: spec.endTick,
                ...(spec.pitch === undefined ? {} : { pitch: spec.pitch }),
                ...(lyric === undefined ? {} : { lyric }),
              },
        delete: (targetIds) => ({
          type: GeneralCommandType.DeleteEntities,
          targetIds,
        }),
      },
    ],
  ]);

function commandBuilderFor(session: EditingSession): ModeCommandBuilder {
  const builder = COMMAND_BUILDERS.get(session.mode.id);
  if (!builder) {
    throw new Error(`Piano Roll cannot edit mode '${session.mode.id}'`);
  }
  return builder;
}

interface MoveTarget {
  note: PianoRollNote;
  initialTick: number;
  initialPitch: number;
}

interface ResizeTarget {
  note: PianoRollNote;
  initialDuration: number;
}

/** Adapts Piano Roll pointer and keyboard gestures to one EditingSession. */
export class NoteEditingController {
  private readonly context: PianoRollContext;
  private readonly coordinates: CoordinateSystem;
  private gesture: GestureHandle | null = null;
  private resizing = false;
  private moving = false;
  private creating = false;
  private awaitingLyric = false;
  private resizeAnchor: PianoRollNote | null = null;
  private resizeAnchorInitialEnd = 0;
  private resizeTargets: ResizeTarget[] = [];
  private moveAnchor: PianoRollNote | null = null;
  private moveAnchorInitialTick = 0;
  private moveAnchorInitialPitch = 0;
  private moveTargets: MoveTarget[] = [];
  private createSpec: CreateSpec | null = null;
  private lastValidTickDelta = 0;
  private lastPreviewPitch: number | null = null;
  private readonly erasingIds = new Set<EntityId>();

  public constructor(context: PianoRollContext, coordinates: CoordinateSystem) {
    this.context = context;
    this.coordinates = coordinates;
  }

  private get isNoteEditingLocked(): boolean {
    return this.context.getState().isPlaying;
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

  public get isAwaitingLyric(): boolean {
    return this.awaitingLyric;
  }

  /** Opens a no-op-safe gesture when a pointer goes down on the editing grid. */
  public beginPointerGesture(): void {
    if (this.isNoteEditingLocked) return;
    this.ensureGesture();
  }

  public beginErase(): boolean {
    if (this.isNoteEditingLocked || !this.ensureGesture()) return false;
    this.erasingIds.clear();
    return true;
  }

  public beginResize(anchor: PianoRollNote): void {
    if (this.isNoteEditingLocked || !this.ensureGesture()) return;
    const selection = this.context.getSelectionContext();
    if (!selection.isSelected(anchor)) selection.notes = [anchor];
    this.resizing = true;
    this.resizeAnchor = anchor;
    this.resizeAnchorInitialEnd = anchor.tick + anchor.durationTicks;
    this.resizeTargets = selection.notes.map((note) => ({
      note,
      initialDuration: note.durationTicks,
    }));
  }

  public updateResize(local: Vector2): void {
    if (this.isNoteEditingLocked) return;
    if (this.creating) {
      this.previewCreate(local);
      return;
    }
    if (!this.resizing || !this.resizeAnchor || !this.gesture) return;

    const snappedEnd = this.coordinates.snapTickToNearest(
      this.coordinates.tickAtScreenX(local.x),
    );
    const newAnchorEnd = Math.max(this.resizeAnchor.tick + 1, snappedEnd);
    const delta = newAnchorEnd - this.resizeAnchorInitialEnd;
    const session = this.getSession();
    if (!session) return;
    this.preview(
      commandBuilderFor(session).resize(
        this.resizeTargets.map(({ note }) => note.id),
        delta,
      ),
    );
  }

  public beginMove(anchor: PianoRollNote): void {
    if (this.isNoteEditingLocked || !this.ensureGesture()) return;
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
    this.lastValidTickDelta = 0;
    this.lastPreviewPitch = anchor.pitch;
  }

  public updateMove(local: Vector2): void {
    if (this.isNoteEditingLocked || !this.moving || !this.moveAnchor) return;
    const session = this.getSession();
    if (!session || !this.gesture) return;

    const newAnchorTick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(local.x),
    );
    const newAnchorPitch = this.coordinates.pitchAtScreenY(local.y);
    const tickDelta = newAnchorTick - this.moveAnchorInitialTick;
    const pitchDelta = newAnchorPitch - this.moveAnchorInitialPitch;
    const command = commandBuilderFor(session).move(
      this.moveTargets.map(({ note }) => note.id),
      tickDelta,
      pitchDelta,
      this.lastValidTickDelta,
    );
    const preview = this.preview(command);
    const firstTarget = this.moveTargets[0];
    const updated = firstTarget
      ? preview.updated.get(firstTarget.note.id)
      : undefined;
    if (firstTarget && updated && preview.rejections.length === 0) {
      this.lastValidTickDelta = updated.tick - firstTarget.initialTick;
      if (
        this.moveTargets.length === 1 &&
        session.mode.id === EditingModeId.MidiVocals &&
        updated.pitch !== this.lastPreviewPitch
      ) {
        this.lastPreviewPitch = updated.pitch;
        this.context.previewNotes([
          {
            id: updated.id,
            tick: updated.tick,
            durationTicks: updated.duration,
            pitch: updated.pitch,
            velocity: updated.velocity,
            midiNote: firstTarget.note.midiNote,
          },
        ]);
      }
    }
  }

  public finishGesture(): void {
    if (this.isNoteEditingLocked) {
      this.cancelGesture();
      return;
    }
    if (this.creating && this.createSpec?.kind !== undefined) {
      this.awaitingLyric =
        this.createSpec.kind === VocalNoteKind.Pitched ||
        this.createSpec.kind === VocalNoteKind.Pitchless;
      if (this.awaitingLyric) {
        this.context.promptLyric(this.createSpec.tick, {
          onCommit: (text) => this.commitPendingLyric(text),
          onCancel: () => this.cancelPendingLyric(),
          onTab: (text) => {
            const tick = this.createSpec?.tick;
            if (this.commitPendingLyric(text) && tick !== undefined) {
              this.context.editNextLyric(tick);
            }
          },
        });
        this.resizing = false;
        return;
      }
    }
    this.commitGesture();
  }

  public cancelGesture(): void {
    const wasAwaitingLyric = this.awaitingLyric;
    this.gesture?.cancel();
    this.resetGestureState();
    this.context.setPreviewState?.(null);
    if (wasAwaitingLyric) this.context.cancelLyricPrompt();
    this.context.requestRender();
  }

  private commitGesture(lyric?: string): EditResult | null {
    const gesture = this.gesture;
    if (!gesture) {
      this.resetGestureState();
      return null;
    }
    if (lyric !== undefined && this.createSpec) {
      const session = this.getSession();
      if (!session) return null;
      this.preview(
        commandBuilderFor(session).create(this.createSpec, session, lyric),
      );
    }
    this.gesture = null;
    const result = gesture.commit();
    this.context.setPreviewState?.(null);
    if (result.changed) {
      const session = this.getSession();
      session?.selection.setSelectedIds([
        ...result.createdIds,
        ...result.updatedIds,
      ]);
    }
    this.resetGestureState();
    this.context.requestRender();
    return result;
  }

  private cancelPendingLyric(): void {
    if (!this.awaitingLyric) return;
    this.gesture?.cancel();
    this.gesture = null;
    this.resetGestureState();
    this.context.setPreviewState?.(null);
    this.context.requestRender();
  }

  private commitPendingLyric(text: string): boolean {
    if (!this.awaitingLyric || !text.trim()) {
      this.cancelPendingLyric();
      return false;
    }
    const result = this.commitGesture(text);
    this.awaitingLyric = false;
    return result?.changed ?? false;
  }

  private resetGestureState(): void {
    this.resizing = false;
    this.moving = false;
    this.creating = false;
    this.awaitingLyric = false;
    this.resizeAnchor = null;
    this.resizeTargets = [];
    this.moveAnchor = null;
    this.moveTargets = [];
    this.createSpec = null;
    this.erasingIds.clear();
    this.lastValidTickDelta = 0;
    this.lastPreviewPitch = null;
  }

  public beginCreate(local: Vector2): void {
    if (
      this.isNoteEditingLocked ||
      this.awaitingLyric ||
      !this.ensureGesture()
    ) {
      return;
    }
    const session = this.getSession();
    if (!session) return;
    const tick = this.coordinates.snapTick(
      this.coordinates.tickAtScreenX(local.x),
    );
    const lane = this.coordinates.laneAtScreenY(local.y);
    if (session.mode.id === EditingModeId.MidiRaw) {
      this.createSpec = {
        tick,
        endTick: tick + 1,
        pitch: this.coordinates.pitchAtScreenY(local.y),
        kind: undefined,
        phraseKind: undefined,
      };
    } else if (session.mode.id === EditingModeId.MidiVocals) {
      const placement = this.context.getVocalPlacement();
      const phraseKind = lane?.phrase ?? placement.phrase ?? undefined;
      const kind =
        phraseKind === undefined
          ? lane?.kind === VocalNoteKind.Percussion ||
            lane?.kind === VocalNoteKind.Pitchless
            ? lane.kind
            : placement.noteKind
          : undefined;
      this.createSpec = {
        tick,
        endTick: tick + 1,
        pitch:
          kind === VocalNoteKind.Pitched
            ? this.coordinates.pitchAtScreenY(
                Math.max(local.y, this.coordinates.getGridTop()),
              )
            : lane && !phraseKind
              ? lane.createPitch
              : undefined,
        kind,
        phraseKind,
      };
    } else {
      return;
    }
    this.creating = true;
    this.resizing = true;
    this.context.requestRender();
  }

  private previewCreate(local: Vector2): void {
    const session = this.getSession();
    const spec = this.createSpec;
    if (!session || !spec || !this.gesture) return;
    const endTick = this.coordinates.snapTickToNearest(
      this.coordinates.tickAtScreenX(local.x),
    );
    spec.endTick = Math.max(spec.tick + 1, endTick);
    const command = commandBuilderFor(session).create(spec, session);
    const preview = this.preview(command);
    if (
      session.mode.id === EditingModeId.MidiVocals &&
      spec.kind === VocalNoteKind.Pitched &&
      spec.pitch !== undefined &&
      spec.pitch !== this.lastPreviewPitch &&
      preview.rejections.length === 0
    ) {
      this.lastPreviewPitch = spec.pitch;
      const added = preview.added[0];
      if (added) {
        this.context.previewNotes([
          {
            id: added.id,
            tick: added.tick,
            durationTicks: added.duration,
            pitch: added.pitch,
            velocity: added.velocity,
            midiNote: null,
          },
        ]);
      }
    }
  }

  private ensureGesture(): boolean {
    if (this.gesture?.isOpen) return true;
    const session = this.getSession();
    if (!session || !COMMAND_BUILDERS.has(session.mode.id)) return false;
    this.gesture = session.beginGesture();
    return true;
  }

  private getSession(): EditingSession | null {
    return this.context.getEditingSession?.() ?? null;
  }

  private preview(command: EditCommand): PreviewState {
    if (!this.gesture)
      throw new Error("Cannot preview without an open gesture");
    const preview = this.gesture.preview(command);
    this.context.setPreviewState?.(preview);
    this.context.requestRender();
    return preview;
  }

  public eraseNote(note: PianoRollNote): void {
    if (this.isNoteEditingLocked) return;
    if (this.gesture?.isOpen) {
      if (this.erasingIds.has(note.id)) return;
      const session = this.getSession();
      if (!session) return;
      this.erasingIds.add(note.id);
      this.preview(commandBuilderFor(session).delete([...this.erasingIds]));
      return;
    }
    this.executeSelectionCommand([note.id]);
  }

  public deleteSelection(): void {
    if (this.isNoteEditingLocked) return;
    const targetIds = this.context
      .getSelectionContext()
      .notes.map((note) => note.id);
    if (targetIds.length === 0) return;
    const session = this.getSession();
    if (!session) return;
    const result = session.execute(
      commandBuilderFor(session).delete(targetIds),
    );
    if (result.changed) {
      const removedIds = new Set<string>(result.removedIds);
      session.selection.setSelectedIds(
        session.selection.getSelectedIds().filter((id) => !removedIds.has(id)),
      );
    }
    this.context.requestRender();
  }

  public transposeSelection(semitones: number): void {
    this.moveSelection(0, semitones);
  }

  public moveSelectionTicks(deltaTicks: number): void {
    this.moveSelection(Math.round(deltaTicks), 0);
  }

  private moveSelection(tickDelta: number, pitchDelta: number): void {
    if (this.isNoteEditingLocked) return;
    const selection = this.context.getSelectionContext().notes;
    if (selection.length === 0) return;
    const session = this.getSession();
    if (!session) return;
    const command = commandBuilderFor(session).move(
      selection.map((note) => note.id),
      tickDelta,
      pitchDelta,
      0,
    );
    const result = session.execute(command);
    if (result.changed) {
      session.selection.setSelectedIds([
        ...result.createdIds,
        ...result.updatedIds,
      ]);
    }
    this.context.requestRender();
  }

  private executeSelectionCommand(targetIds: readonly EntityId[]): void {
    const session = this.getSession();
    if (!session || targetIds.length === 0) return;
    const result = session.execute(
      commandBuilderFor(session).delete(targetIds),
    );
    if (result.changed) {
      const removedIds = new Set<string>(result.removedIds);
      session.selection.setSelectedIds(
        session.selection.getSelectedIds().filter((id) => !removedIds.has(id)),
      );
    }
    this.context.requestRender();
  }
}
