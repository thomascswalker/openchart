import type { EditingModeId, EntityClassification } from "./mode.js";

export interface ClipboardEntity {
  relativeTick: number;
  duration: number;
  velocity: number;
  pitch: number;
  row?: string;
  classification: EntityClassification;
  lyric?: string;
}

export interface ClipboardPayload {
  sourceModeId: EditingModeId;
  entities: ClipboardEntity[];
}

/** Stores a defensive copy of the shared, mode-tagged editing payload. */
export class ClipboardService {
  private payload: ClipboardPayload | null = null;

  public clear(): void {
    this.payload = null;
  }

  public setData(payload: ClipboardPayload): void {
    this.payload = clonePayload(payload);
  }

  public getData(): ClipboardPayload | null {
    return this.payload ? clonePayload(this.payload) : null;
  }

  public canPaste(): boolean {
    return (this.payload?.entities.length ?? 0) > 0;
  }
}

function clonePayload(payload: ClipboardPayload): ClipboardPayload {
  return {
    sourceModeId: payload.sourceModeId,
    entities: payload.entities.map((entity) => ({
      ...entity,
      classification: { ...entity.classification },
    })),
  };
}
