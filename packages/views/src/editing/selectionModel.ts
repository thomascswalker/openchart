/** Listener notified after the selected entity IDs change. */
export type SelectionListener = (selectedIds: readonly string[]) => void;

/** Shared, view-independent selection for note and phrase entity IDs. */
export class SelectionModel {
  private readonly selectedIds = new Set<string>();
  private readonly listeners = new Set<SelectionListener>();
  private revision = 0;

  /** Returns the selected IDs in insertion order. */
  public getSelectedIds(): string[] {
    return [...this.selectedIds];
  }

  /** Returns the current selection revision. */
  public getRevision(): number {
    return this.revision;
  }

  /** Reports whether an entity ID is selected. */
  public isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  /** Subscribes to selection changes and returns an unsubscribe function. */
  public subscribe(listener: SelectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Replaces the selection, notifying only when its contents change. */
  public setSelectedIds(ids: Iterable<string>): void {
    const next = new Set(ids);
    if (
      next.size === this.selectedIds.size &&
      [...next].every((id) => this.selectedIds.has(id))
    ) {
      return;
    }

    this.selectedIds.clear();
    for (const id of next) this.selectedIds.add(id);
    this.notify();
  }

  /** Adds an entity ID to the selection. */
  public add(id: string): void {
    if (this.selectedIds.has(id)) return;
    this.selectedIds.add(id);
    this.notify();
  }

  /** Removes an entity ID from the selection. */
  public delete(id: string): void {
    if (!this.selectedIds.delete(id)) return;
    this.notify();
  }

  /** Clears the selection. */
  public clear(): void {
    if (this.selectedIds.size === 0) return;
    this.selectedIds.clear();
    this.notify();
  }

  private notify(): void {
    this.revision += 1;
    const selectedIds = this.getSelectedIds();
    for (const listener of this.listeners) listener(selectedIds);
  }
}
