import {
  EditCommandType,
  EntityType,
  parseEntityFromId,
  type ClipboardEntity,
  type ClipboardPayload,
  type EditingSession,
  type EntityId,
  type NoteSnapshot,
} from "@openchart/views";
import Platform from "../../platform";
import { Service } from "../../platform/services";
import { EditorStateService } from "./state";
import { ActiveChartViewService } from "./activeChartView";
import { EditingService } from "./editing";
import { PlaybackService } from "../playback";

export class EditorClipboardService extends Service {
  static dependencies = [
    "editor.active-chart-view",
    "editor.editing",
    "editor.state",
    "playback",
  ];

  private readonly activeChartView: ActiveChartViewService;
  private readonly editingService: EditingService;
  private readonly editorState: EditorStateService;
  private readonly playback: PlaybackService;

  constructor(
    activeChartView: ActiveChartViewService,
    editingService: EditingService,
    editorState: EditorStateService,
    playback: PlaybackService,
  ) {
    super();
    this.activeChartView = activeChartView;
    this.editingService = editingService;
    this.editorState = editorState;
    this.playback = playback;
    this.activeChartView.subscribe(() => this.sync());
    this.editingService.subscribe(() => this.sync());
    this.editingService.selection.subscribe(() => this.sync());
    this.playback.subscribe(() => this.sync());
  }

  public readonly reset = (): void => this.sync();

  public canCopy(): boolean {
    return this.getCopySelection() !== null;
  }

  public canCut(): boolean {
    const session = this.editingService.getActiveSession();
    return (
      session !== null &&
      session.can(EditCommandType.DeleteEntities) &&
      !this.playback.getSnapshot().isPlaying &&
      this.getCopySelection(session) !== null
    );
  }

  public canPaste(): boolean {
    return (
      !this.playback.getSnapshot().isPlaying &&
      this.editingService.getActiveSession() !== null &&
      this.editingService.clipboard.canPaste()
    );
  }

  public copy(): void {
    const selection = this.getCopySelection();
    if (selection) this.editingService.clipboard.setData(selection.payload);
    this.sync();
  }

  public cut(): void {
    const session = this.editingService.getActiveSession();
    const selection = session ? this.getCopySelection(session) : null;
    if (
      !session ||
      !selection ||
      !session.can(EditCommandType.DeleteEntities) ||
      this.playback.getSnapshot().isPlaying
    ) {
      return;
    }

    this.editingService.clipboard.setData(selection.payload);
    const result = session.execute({
      type: EditCommandType.DeleteEntities,
      targetIds: selection.targetIds,
    });
    if (result.changed) session.selection.setSelectedIds([]);
    this.sync();
  }

  public paste(): void {
    const session = this.editingService.getActiveSession();
    const view = this.activeChartView.getSnapshot();
    if (
      !session ||
      !view ||
      !this.editingService.clipboard.canPaste() ||
      this.playback.getSnapshot().isPlaying
    ) {
      return;
    }

    const result = session.pasteClipboard(view.getPasteAnchorTick());
    if (result.rejections.length > 0) {
      const count = result.rejections.length;
      this.editorState.setError(
        `${count} note${count === 1 ? "" : "s"} could not be pasted into this chart.`,
      );
    }
    this.sync();
  }

  public sync(): void {
    Platform.context.set("clipboard.can-copy", this.canCopy());
    Platform.context.set("clipboard.can-cut", this.canCut());
    Platform.context.set("clipboard.can-paste", this.canPaste());
    this.notify();
  }

  private getCopySelection(
    session = this.editingService.getActiveSession(),
  ): { payload: ClipboardPayload; targetIds: EntityId[] } | null {
    const trackIndex = session?.target.trackIndex;
    if (!session || trackIndex === null || trackIndex === undefined) {
      return null;
    }

    const document = this.editingService.getDocument();
    const selected = session.selection.getSelectedIds().flatMap((id) => {
      const parsed = parseEntityFromId(id);
      if (
        parsed?.type !== EntityType.Note ||
        parsed.trackIndex !== trackIndex
      ) {
        return [];
      }
      const note = document.getNote(id);
      return note
        ? [{ id, note, classification: session.classifyNote(note) }]
        : [];
    });
    if (selected.length === 0) return null;

    const firstTick = selected.reduce(
      (tick, item) => Math.min(tick, item.note.tick),
      Number.POSITIVE_INFINITY,
    );
    const entities = selected.map(({ note, classification }) =>
      this.createClipboardEntity(session, note, classification, firstTick),
    );
    return {
      payload: { sourceModeId: session.mode.id, entities },
      targetIds: selected.map((item) => item.note.id),
    };
  }

  private createClipboardEntity(
    session: EditingSession,
    note: NoteSnapshot,
    classification: ClipboardEntity["classification"],
    firstTick: number,
  ): ClipboardEntity {
    const row = session.getProjection().rowForNote(note);
    const lyric =
      session.mode.id === "midi.vocals" && classification.type === "note"
        ? this.editingService
            .getDocument()
            .getLyricAt(note.trackIndex, note.tick)?.text
        : undefined;
    return {
      relativeTick: note.tick - firstTick,
      duration: note.duration,
      velocity: note.velocity,
      pitch: note.pitch,
      ...(row ? { row: row.id } : {}),
      classification,
      ...(lyric !== undefined ? { lyric } : {}),
    };
  }
}
