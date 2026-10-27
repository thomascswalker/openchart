import type { MidiNote } from "@openchart/midi";
import type {
  ChartView,
  EditingSession,
  EntityId,
  GestureHandle,
  NoteSnapshot,
} from "@openchart/views";
import { formatNoteId, parseEntityId } from "@openchart/views";
import type { HighwayContext } from "../context";
import type { IndexedNote } from "../noteIndex";

export class HighwayNoteEditingController {
  private readonly context: HighwayContext;
  private gesture: GestureHandle | null = null;

  public constructor(context: HighwayContext) {
    this.context = context;
  }

  public placeNoteAt(
    chart: ChartView,
    lane: number,
    tick: number,
    shiftKey: boolean,
    preferredSustain: MidiNote | IndexedNote | null = null,
  ): boolean {
    const session = this.context.getEditingSession();
    if (!session) return false;
    const preferredNote =
      preferredSustain === null ? null : getMidiNote(preferredSustain);
    const preferredSustainId = preferredNote
      ? (this.getEntityId(chart, preferredNote) ?? undefined)
      : undefined;
    const command =
      session.mode.id === "chart.drums"
        ? {
            type: "PLACE_CHART_NOTE",
            lane,
            tick,
            drumKind: this.context.getDrumPlacementKind(),
          }
        : {
            type: "PLACE_CHART_NOTE",
            lane,
            tick,
            placement: this.context.getNotePlacementType?.() ?? "normal",
            cutPolicy: getCutPolicy(
              shiftKey,
              preferredSustainId !== undefined,
              preferredNote !== null &&
                preferredNote.pitch - chart.getOffset() === lane,
            ),
            ...(preferredSustainId ? { preferredSustainId } : {}),
          };
    return session.execute(command).changed;
  }

  public previewPlaceNote(
    lane: number,
    startTick: number,
    endTick: number,
    preserveSustain: boolean,
  ): boolean {
    const session = this.context.getEditingSession();
    if (!session) return false;
    this.gesture ??= session.beginGesture();
    const command =
      session.mode.id === "chart.drums"
        ? {
            type: "PLACE_CHART_NOTE",
            lane,
            tick: startTick,
            endTick: Math.max(startTick + 1, endTick),
            drumKind: this.context.getDrumPlacementKind(),
          }
        : {
            type: "PLACE_CHART_NOTE",
            lane,
            tick: startTick,
            endTick: Math.max(startTick + 1, endTick),
            placement: this.context.getNotePlacementType?.() ?? "normal",
            cutPolicy: preserveSustain ? "none" : "all",
          };
    const preview = this.gesture.preview(command);
    this.context.setPreviewState(preview);
    return preview.rejections.length === 0 && preview.added.length > 0;
  }

  public cutSustainsAtTick(
    _chart: ChartView,
    tick: number,
    shiftKey: boolean,
    preferredSustain: MidiNote | IndexedNote | null = null,
    sameLanePlacement = false,
  ): boolean {
    const session = this.context.getEditingSession();
    if (!session || session.mode.id === "chart.drums") return false;
    const chart = this.context.getCurrentChart();
    const source =
      preferredSustain === null ? null : getMidiNote(preferredSustain);
    const preferredSustainId =
      chart && source
        ? (this.getEntityId(chart, source) ?? undefined)
        : undefined;
    return session.execute({
      type: "CUT_SUSTAINS",
      tick,
      cutPolicy: getCutPolicy(
        shiftKey,
        preferredSustainId !== undefined,
        sameLanePlacement,
      ),
      ...(preferredSustainId ? { preferredSustainId } : {}),
    }).changed;
  }

  public deleteNote(
    chart: ChartView,
    note: MidiNote | IndexedNote,
    removeFromSelection = true,
  ): boolean {
    const session = this.context.getEditingSession();
    const source = getMidiNote(note);
    const id = source ? this.getEntityId(chart, source) : null;
    if (!session || !id) return false;
    const changed = session.execute({
      type: "DELETE_ENTITIES",
      targetIds: [id],
    }).changed;
    if (changed && removeFromSelection) session.selection.delete(id);
    return changed;
  }

  public moveNote(
    chart: ChartView,
    note: MidiNote | IndexedNote,
    lane: number,
    tick: number,
  ): boolean {
    const session = this.context.getEditingSession();
    const source = getMidiNote(note);
    if (!source) return false;
    const id = this.getEntityId(chart, source);
    const snapshot = id ? this.getSnapshot(source, id) : null;
    const currentLane = snapshot ? this.getLane(session, snapshot) : null;
    if (!session || !id || currentLane === null) return false;
    this.gesture ??= session.beginGesture();
    this.context.setPreviewState(
      this.gesture.preview({
        type: "MOVE_CHART_NOTES",
        targetIds: [id],
        tickDelta: tick - source.start,
        laneDelta: lane - currentLane,
      }),
    );
    return true;
  }

  public resizeNote(
    chart: ChartView,
    note: MidiNote | IndexedNote,
    endTick: number,
  ): boolean {
    const session = this.context.getEditingSession();
    const source = getMidiNote(note);
    if (!source) return false;
    const id = this.getEntityId(chart, source);
    if (!session || !id || session.mode.id === "chart.drums") return false;
    this.gesture ??= session.beginGesture();
    this.context.setPreviewState(
      this.gesture.preview({
        type: "SET_SUSTAIN_END",
        targetIds: [id],
        endTick,
        extendPastNext: "allow",
      }),
    );
    return true;
  }

  public previewMove(
    chart: ChartView,
    notes: readonly MidiNote[],
    tickDelta: number,
    laneDelta: number,
  ): boolean {
    const session = this.context.getEditingSession();
    const targetIds = notes
      .map((note) => this.getEntityId(chart, note))
      .filter((id): id is EntityId => id !== null);
    if (!session || targetIds.length === 0) return false;
    this.gesture ??= session.beginGesture();
    const preview = this.gesture.preview({
      type: "MOVE_CHART_NOTES",
      targetIds,
      tickDelta,
      laneDelta,
    });
    this.context.setPreviewState(preview);
    return preview.rejections.length === 0;
  }

  public previewSustainEnd(
    chart: ChartView,
    notes: readonly MidiNote[],
    endTick: number,
    extendPastNext: "allow" | "stop-at-next",
  ): boolean {
    const session = this.context.getEditingSession();
    const targetIds = notes
      .map((note) => this.getEntityId(chart, note))
      .filter((id): id is EntityId => id !== null);
    if (
      !session ||
      targetIds.length === 0 ||
      session.mode.id === "chart.drums"
    ) {
      return false;
    }
    this.gesture ??= session.beginGesture();
    const preview = this.gesture.preview({
      type: "SET_SUSTAIN_END",
      targetIds,
      endTick,
      extendPastNext,
    });
    this.context.setPreviewState(preview);
    return preview.rejections.length === 0;
  }

  public commitGesture(): boolean {
    const gesture = this.gesture;
    if (!gesture) return false;
    this.gesture = null;
    const result = gesture.commit();
    this.context.setPreviewState(null);
    return result.changed;
  }

  public cancelGesture(): void {
    if (!this.gesture) return;
    this.gesture.cancel();
    this.gesture = null;
    this.context.setPreviewState(null);
  }

  public deleteSelection(): boolean {
    const session = this.context.getEditingSession();
    if (!session) return false;
    const targetIds = this.getTargetSelection(session);
    if (targetIds.length === 0) return false;
    const result = session.execute({
      type: "DELETE_ENTITIES",
      targetIds,
    });
    if (result.changed) session.selection.setSelectedIds([]);
    this.context.requestRender();
    return result.changed;
  }

  private getTargetSelection(session: EditingSession): EntityId[] {
    return session.selection
      .getSelectedIds()
      .filter((id): id is EntityId => this.belongsToTarget(id));
  }

  private belongsToTarget(id: string): boolean {
    const session = this.context.getEditingSession();
    const parsed = parseEntityId(id);
    return (
      parsed?.kind === "note" &&
      parsed.trackIndex === session?.target.trackIndex
    );
  }

  private getEntityId(chart: ChartView, note: MidiNote): EntityId | null {
    const session = this.context.getEditingSession();
    const track = chart.getMidiTrack();
    const trackIndex = session?.target.trackIndex;
    return session && track && trackIndex !== null && trackIndex !== undefined
      ? formatNoteId(trackIndex, track.getEventId(note.noteOn))
      : null;
  }

  private getSnapshot(note: MidiNote, id: EntityId): NoteSnapshot {
    const trackIndex = this.context.getEditingSession()?.target.trackIndex ?? 0;
    return {
      id,
      trackIndex,
      tick: note.start,
      pitch: note.pitch,
      duration: note.end - note.start,
      velocity: note.velocity,
    };
  }

  private getLane(
    session: EditingSession | null,
    snapshot: NoteSnapshot,
  ): number | null {
    if (!session) return null;
    const classification = session.classifyNote(snapshot);
    if (classification.kind !== "note" || !classification.movable) return null;
    if (
      session.mode.id === "chart.drums" &&
      classification.subtype === "kick"
    ) {
      return 0;
    }
    return session.getProjection().rowForNote(snapshot)?.index ?? null;
  }
}

function getMidiNote(note: MidiNote | IndexedNote): MidiNote | null {
  return "source" in note ? note.source : note;
}

function getCutPolicy(
  shiftKey: boolean,
  hasPreferredSustain: boolean,
  sameLanePlacement: boolean,
): "all" | "none" | "preferred-only" | "all-but-preferred" {
  if (!hasPreferredSustain) return shiftKey ? "none" : "all";
  if (sameLanePlacement) return shiftKey ? "preferred-only" : "all";
  return shiftKey ? "all" : "preferred-only";
}
