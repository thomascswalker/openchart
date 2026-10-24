export class BaseSelection<T> {
  protected readonly selected = new Set<T>();

  public get notes(): T[] {
    return Array.from(this.selected);
  }

  public get size(): number {
    return this.selected.size;
  }

  public isSelected(note: T): boolean {
    return this.selected.has(note);
  }

  public add(note: T): void {
    if (this.selected.has(note)) return;
    this.selected.add(note);
    this.onChanged();
  }

  public delete(note: T): void {
    if (!this.selected.delete(note)) return;
    this.onChanged();
  }

  public clear(): void {
    if (this.selected.size === 0) return;
    this.selected.clear();
    this.onChanged();
  }

  public set(notes: Iterable<T>): void {
    const next = new Set(notes);
    if (
      next.size === this.selected.size &&
      [...next].every((note) => this.selected.has(note))
    ) {
      return;
    }
    this.selected.clear();
    for (const note of next) this.selected.add(note);
    this.onChanged();
  }

  protected onChanged(): void {}
}
