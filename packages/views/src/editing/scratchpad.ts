/** Volatile tick, pitch-row and duration deltas for gesture previews. */
export interface EditDelta {
  tickDelta?: number;
  trackDelta?: number;
  durationDelta?: number;
}

/** Listener notified when the scratchpad preview map changes. */
export type ScratchpadListener = (
  edits: ReadonlyMap<string, EditDelta>,
) => void;

/** Volatile drag previews, kept separate from MIDI data and edit history. */
export class EditScratchpad {
  private readonly edits = new Map<string, EditDelta>();
  private readonly listeners = new Set<ScratchpadListener>();

  /** Reads the preview delta for one entity ID. */
  public get(targetId: string): EditDelta | undefined {
    return this.edits.get(targetId);
  }

  /** Returns an immutable-by-convention copy of all preview deltas. */
  public getSnapshot(): ReadonlyMap<string, EditDelta> {
    return new Map(this.edits);
  }

  /** Subscribes to preview updates and returns an unsubscribe function. */
  public subscribe(listener: ScratchpadListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Sets one entity's volatile preview delta. */
  public set(targetId: string, edit: EditDelta): void {
    this.edits.set(targetId, { ...edit });
    this.notify();
  }

  /** Replaces all preview deltas at once. */
  public setMany(edits: ReadonlyMap<string, EditDelta>): void {
    this.edits.clear();
    for (const [targetId, edit] of edits) {
      this.edits.set(targetId, { ...edit });
    }
    this.notify();
  }

  /** Clears all preview deltas. */
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
