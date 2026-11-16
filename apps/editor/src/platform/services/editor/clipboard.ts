import {
  type ClipboardEntity,
  type ClipboardPayload,
  EditCommandType,
  EditingModeId,
  type EditingSession,
  type EntityId,
  EntityType,
  type NoteSnapshot,
  parseEntityFromId,
} from '@openchart/views';

import Platform from '../..';
import { IPlaybackService } from '../playback/playback';
import { Service, createDecorator } from '../service';
import { IActiveChartViewService } from './activeChartView';
import { IEditingService } from './editing';
import { IEditorStateService } from './state';

export class EditorClipboardService extends Service {
  constructor(
    @IActiveChartViewService
    private readonly activeChartViewService: IActiveChartViewService,
    @IEditingService private readonly editingService: IEditingService,
    @IEditorStateService
    private readonly editorStateService: IEditorStateService,
    @IPlaybackService private readonly playbackService: IPlaybackService,
  ) {
    super();
  }

  public init(): void {
    const sync = () => this.sync();
    this.activeChartViewService.subscribe(sync);
    this.editingService.subscribe(sync);
    this.editingService.selection.subscribe(sync);
    this.playbackService.subscribe(sync);
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
      !this.playbackService.getSnapshot().isPlaying &&
      this.getCopySelection(session) !== null
    );
  }

  public canPaste(): boolean {
    return (
      !this.playbackService.getSnapshot().isPlaying &&
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
      this.playbackService.getSnapshot().isPlaying
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
    const view = this.activeChartViewService.getSnapshot();
    if (
      !session ||
      !view ||
      !this.editingService.clipboard.canPaste() ||
      this.playbackService.getSnapshot().isPlaying
    ) {
      return;
    }

    const result = session.pasteClipboard(view.getPasteAnchorTick());
    if (result.rejections.length > 0) {
      const count = result.rejections.length;
      this.editorStateService.setError(
        `${count} note${count === 1 ? '' : 's'} could not be pasted into this chart.`,
      );
    }
    this.sync();
  }

  public sync(): void {
    Platform.context.set('clipboard.can-copy', this.canCopy());
    Platform.context.set('clipboard.can-cut', this.canCut());
    Platform.context.set('clipboard.can-paste', this.canPaste());
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
    classification: ClipboardEntity['classification'],
    firstTick: number,
  ): ClipboardEntity {
    const row = session.getProjection().rowForNote(note);
    const lyric =
      session.mode.id === EditingModeId.MidiVocals &&
      classification.type === 'note'
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

export type IEditorClipboardService = EditorClipboardService;
export const IEditorClipboardService =
  createDecorator<IEditorClipboardService>('editor.clipboard');
