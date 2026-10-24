export interface EditDelta {
  tickDelta?: number;
  trackDelta?: number;
  durationDelta?: number;
}

export type ScratchpadListener = (
  edits: ReadonlyMap<string, EditDelta>,
) => void;

/** Volatile drag previews, kept separate from MIDI data and edit history. */
export class EditScratchpad {
  private readonly edits = new Map<string, EditDelta>();
  private readonly listeners = new Set<ScratchpadListener>();

  public get(targetId: string): EditDelta | undefined {
    return this.edits.get(targetId);
  }

  public getSnapshot(): ReadonlyMap<string, EditDelta> {
    return new Map(this.edits);
  }

  public subscribe(listener: ScratchpadListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public set(targetId: string, edit: EditDelta): void {
    this.edits.set(targetId, { ...edit });
    this.notify();
  }

  public setMany(edits: ReadonlyMap<string, EditDelta>): void {
    this.edits.clear();
    for (const [targetId, edit] of edits) {
      this.edits.set(targetId, { ...edit });
    }
    this.notify();
  }

  public clear(): void {
    if (this.edits.size === 0) return;
    this.edits.clear();
    this.notify();
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
