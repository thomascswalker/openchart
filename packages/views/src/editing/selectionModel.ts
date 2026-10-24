export type SelectionListener = (selectedIds: readonly string[]) => void;

/** Shared, view-independent selection for note and phrase entity IDs. */
export class SelectionModel {
  private readonly selectedIds = new Set<string>();
  private readonly listeners = new Set<SelectionListener>();
  private revision = 0;

  public getSelectedIds(): string[] {
    return [...this.selectedIds];
  }

  public getRevision(): number {
    return this.revision;
  }

  public isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  public subscribe(listener: SelectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

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

  public add(id: string): void {
    if (this.selectedIds.has(id)) return;
    this.selectedIds.add(id);
    this.notify();
  }

  public delete(id: string): void {
    if (!this.selectedIds.delete(id)) return;
    this.notify();
  }

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
