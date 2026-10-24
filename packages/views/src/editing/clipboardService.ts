import type { EditablePhraseKind } from "../chartEditing.js";
import type { ChartEditAction } from "./action.js";
import type { ChartDocument, NoteSnapshot } from "./chartDocument.js";
import type { SelectionModel } from "./selectionModel.js";

/** A note snapshot stored in the legacy clipboard payload. */
export interface ClipboardNote {
  relativeTick: number;
  relativeTrack: number;
  pitch: number;
  duration: number;
  velocity: number;
  phraseType?: EditablePhraseKind;
}

/** Legacy clipboard payload kept until the Phase 8 clipboard migration. */
export interface ChartClipboard {
  notes: ClipboardNote[];
  extensions?: {
    vocals?: {
      lyrics: Array<string | null>;
    };
  };
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

  /** Rebinds the clipboard reader after the host document is replaced. */
  public setDocument(document: ChartDocument): void {
    this.document = document;
  }

  /** Clears the current clipboard payload. */
  public clear(): void {
    this.clipboard = { notes: [] };
  }

  /** Adds the interim lyric extension used by Piano Roll vocal paste. */
  public setVocalLyrics(lyrics: readonly (string | null)[]): void {
    this.clipboard = {
      ...this.clipboard,
      extensions: { vocals: { lyrics: [...lyrics] } },
    };
  }

  /** Returns a copy of the interim lyric extension, when present. */
  public getVocalLyrics(): (string | null)[] | null {
    const lyrics = this.clipboard.extensions?.vocals?.lyrics;
    return lyrics ? [...lyrics] : null;
  }

  /** Copies currently selected notes into the legacy payload. */
  public copy(): ChartClipboard {
    this.clipboard = { notes: [] };
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

  /** Returns a defensive copy of the current clipboard payload. */
  public getData(): ChartClipboard {
    return {
      notes: this.clipboard.notes.map((note) => ({ ...note })),
      ...(this.clipboard.extensions
        ? {
            extensions: {
              vocals: this.clipboard.extensions.vocals
                ? {
                    lyrics: [...this.clipboard.extensions.vocals.lyrics],
                  }
                : undefined,
            },
          }
        : {}),
    };
  }

  /** Reports whether the payload contains notes that can be pasted. */
  public canPaste(): boolean {
    return this.clipboard.notes.length > 0;
  }

  /** Builds legacy note/phrase commands at the requested paste anchor. */
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
