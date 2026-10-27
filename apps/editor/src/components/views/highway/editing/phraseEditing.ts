import type {
  EditablePhraseKind,
  EntityId,
  GestureHandle,
} from "@openchart/views";
import { formatNoteId } from "@openchart/views";
import type { HighwayContext } from "../context";
import { HighwayCoordinateSystem } from "../coordinates";
import type { HighwayPhrase } from "../hitTesting";
import type { HighwayPhraseDragState } from "../types";

export class HighwayPhraseEditingController {
  private readonly context: HighwayContext;
  private readonly coordinates: HighwayCoordinateSystem;
  private dragState: HighwayPhraseDragState | null = null;
  private gesture: GestureHandle | null = null;

  public constructor(
    context: HighwayContext,
    coordinates: HighwayCoordinateSystem,
  ) {
    this.context = context;
    this.coordinates = coordinates;
  }

  public getDragState(): HighwayPhraseDragState | null {
    return this.dragState;
  }

  public getSelectedPhraseIds(): EntityId[] {
    const session = this.context.getEditingSession();
    const chart = this.context.getCurrentChart();
    const track = chart?.getMidiTrack();
    const trackIndex = session?.target.trackIndex;
    if (!session || !track || trackIndex === null || trackIndex === undefined) {
      return [];
    }
    const selected = new Set(session.selection.getSelectedIds());
    return track.getNotes().flatMap((note) => {
      const id = this.getEntityId(trackIndex, track.getEventId(note.noteOn));
      if (!selected.has(id)) return [];
      const classification = session.classifyNote({
        id,
        trackIndex,
        tick: note.start,
        pitch: note.pitch,
        duration: note.end - note.start,
        velocity: note.velocity,
      });
      return classification.kind === "phrase" ? [id] : [];
    });
  }

  public isPhraseSelected(id: EntityId): boolean {
    return this.getSelectedPhraseIds().includes(id);
  }

  public selectPhrase(id: EntityId | null): void {
    const selection = this.context.getEditingSession()?.selection;
    selection?.setSelectedIds(id ? [id] : []);
  }

  public selectPhrases(ids: Iterable<EntityId>, additive: boolean): void {
    const selection = this.context.getEditingSession()?.selection;
    if (!selection) return;
    selection.setSelectedIds(
      additive ? [...selection.getSelectedIds(), ...ids] : ids,
    );
  }

  public beginPhraseDrag(
    pointerId: number,
    kind: EditablePhraseKind,
    tick: number,
    phrase: HighwayPhrase | null,
    operation: HighwayPhraseDragState["operation"],
  ): void {
    const session = this.context.getEditingSession();
    if (!session) return;
    this.gesture = session.beginGesture();
    this.dragState = {
      pointerId,
      kind,
      startTick: phrase?.start ?? tick,
      endTick: phrase?.end ?? tick,
      pointerTick: tick,
      initialStartTick: phrase?.start ?? tick,
      initialEndTick: phrase?.end ?? tick,
      operation,
      id: phrase?.id ?? null,
      moved: false,
    };
    if (phrase) this.selectPhrase(phrase.id);
  }

  public updatePhraseDrag(tick: number): void {
    const drag = this.dragState;
    if (!drag) return;
    const nextTick =
      drag.operation === "move" ? this.coordinates.snapTick(tick) : tick;
    drag.moved ||= nextTick !== drag.pointerTick;
    if (drag.operation === "create") {
      drag.startTick = Math.min(drag.pointerTick, nextTick);
      drag.endTick = Math.max(drag.pointerTick, nextTick);
    } else if (drag.operation === "move") {
      const start = Math.max(
        0,
        this.coordinates.snapTick(
          drag.initialStartTick + nextTick - drag.pointerTick,
        ),
      );
      const duration = drag.initialEndTick - drag.initialStartTick;
      drag.startTick = start;
      drag.endTick = start + duration;
    } else if (drag.operation === "resize-start") {
      drag.startTick = Math.min(drag.initialEndTick - 1, Math.max(0, nextTick));
    } else {
      drag.endTick = Math.max(drag.initialStartTick + 1, nextTick);
    }
    this.updatePreview(drag);
  }

  public finishPhraseDrag(): boolean {
    const drag = this.dragState;
    const gesture = this.gesture;
    this.dragState = null;
    this.gesture = null;
    if (!drag || !gesture) return false;
    if (drag.operation === "create" && !drag.moved) {
      gesture.cancel();
      this.context.setPreviewState(null);
      return false;
    }
    const result = gesture.commit();
    this.context.setPreviewState(null);
    const session = this.context.getEditingSession();
    if (result.createdIds.length > 0) {
      session?.selection.setSelectedIds(result.createdIds);
    } else if (result.updatedIds.length > 0) {
      session?.selection.setSelectedIds(result.updatedIds);
    }
    return result.changed;
  }

  public cancelPhraseDrag(): void {
    this.dragState = null;
    this.gesture?.cancel();
    this.gesture = null;
    this.context.setPreviewState(null);
  }

  public deleteSelectedPhrase(): boolean {
    const session = this.context.getEditingSession();
    if (!session) return false;
    const targetIds = this.getSelectedPhraseIds();
    if (targetIds.length === 0) return false;
    const changed = session.execute({
      type: "DELETE_ENTITIES",
      targetIds,
    }).changed;
    if (changed) session.selection.setSelectedIds([]);
    this.context.requestRender();
    return changed;
  }

  private updatePreview(drag: HighwayPhraseDragState): void {
    const gesture = this.gesture;
    if (!gesture || (drag.operation === "create" && !drag.moved)) return;
    const startTick = Math.min(drag.startTick, drag.endTick);
    const endTick = Math.max(startTick + 1, drag.endTick);
    const command = drag.id
      ? {
          type: "UPDATE_PHRASE",
          id: drag.id,
          startTick,
          endTick,
        }
      : {
          type: "CREATE_PHRASE",
          phraseKind: drag.kind,
          startTick,
          endTick,
        };
    this.context.setPreviewState(gesture.preview(command));
  }

  private getEntityId(trackIndex: number, eventId: string): EntityId {
    return formatNoteId(trackIndex, eventId);
  }
}
