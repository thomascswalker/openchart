import type { EditablePhraseKind } from "../chartEditing.js";
import type { ChartEditAction } from "./action.js";
import type { ChartDocument, NoteSnapshot } from "./chartDocument.js";
import type { SelectionModel } from "./selectionModel.js";

export interface ClipboardNote {
  relativeTick: number;
  relativeTrack: number;
  pitch: number;
  duration: number;
  velocity: number;
  phraseType?: EditablePhraseKind;
}

export interface ChartClipboard {
  notes: ClipboardNote[];
}

/** Serializes selected chart entities and translates paste into edit commands. */
export class ClipboardService {
  private clipboard: ChartClipboard = { notes: [] };

  public constructor(
    private document: ChartDocument,
    private readonly selection: SelectionModel,
    private readonly getPhraseType?: (
      trackIndex: number,
      pitch: number,
    ) => EditablePhraseKind | null,
  ) {}

  public setDocument(document: ChartDocument): void {
    this.document = document;
  }

  public clear(): void {
    this.clipboard = { notes: [] };
  }

  public copy(): ChartClipboard {
    const notes = this.selection
      .getSelectedIds()
      .map((id) => this.document.getNote(id))
      .filter((note): note is NoteSnapshot => note !== null);
    if (notes.length === 0) {
      this.clipboard = { notes: [] };
      return this.getData();
    }

    const minTick = Math.min(...notes.map((note) => note.tick));
    const minTrack = Math.min(...notes.map((note) => note.trackIndex));
    this.clipboard = {
      notes: notes.map((note) => {
        const phraseType = this.getPhraseType?.(note.trackIndex, note.pitch);
        return {
          relativeTick: note.tick - minTick,
          relativeTrack: note.trackIndex - minTrack,
          pitch: note.pitch,
          duration: note.duration,
          velocity: note.velocity,
          ...(phraseType ? { phraseType } : {}),
        };
      }),
    };
    return this.getData();
  }

  public getData(): ChartClipboard {
    return { notes: this.clipboard.notes.map((note) => ({ ...note })) };
  }

  public canPaste(): boolean {
    return this.clipboard.notes.length > 0;
  }

  public createPasteActions(
    targetTick: number,
    targetTrackIndex: number,
  ): ChartEditAction[] {
    if (!Number.isInteger(targetTick) || targetTick < 0) {
      throw new RangeError("targetTick must be a non-negative integer");
    }
    if (!Number.isInteger(targetTrackIndex) || targetTrackIndex < 0) {
      throw new RangeError("targetTrackIndex must be a non-negative integer");
    }

    return this.clipboard.notes.map((note): ChartEditAction => {
      const trackIndex = targetTrackIndex + note.relativeTrack;
      if (note.phraseType) {
        return {
          type: "CREATE_PHRASE",
          trackIndex,
          startTick: targetTick + note.relativeTick,
          duration: note.duration,
          phraseType: note.phraseType,
        };
      }
      return {
        type: "ADD_NOTE",
        trackIndex,
        tick: targetTick + note.relativeTick,
        pitch: note.pitch,
        duration: note.duration,
        velocity: note.velocity,
      };
    });
  }

  /** @deprecated Removed in Phase 10; execute paste through an EditingSession. */
  public paste(
    targetTick: number,
    targetTrackIndex: number,
    dispatchBatch: (actions: readonly ChartEditAction[]) => boolean,
  ): boolean {
    return dispatchBatch(this.createPasteActions(targetTick, targetTrackIndex));
  }
}
