import type { MidiChannelEvent } from "@openchart/core";

export class SelectionContext {
  private readonly selected = new Set<MidiChannelEvent>();
  private revision = 0;

  public get notes(): MidiChannelEvent[] {
    return Array.from(this.selected);
  }

  public get size(): number {
    return this.selected.size;
  }

  public getRevision(): number {
    return this.revision;
  }

  public isSelected(noteOn: MidiChannelEvent): boolean {
    return this.selected.has(noteOn);
  }

  public add(noteOn: MidiChannelEvent): void {
    if (this.selected.has(noteOn)) return;
    this.selected.add(noteOn);
    this.revision += 1;
  }

  public remove(noteOn: MidiChannelEvent): void {
    if (this.selected.delete(noteOn)) this.revision += 1;
  }

  public clear(): void {
    if (this.selected.size === 0) return;
    this.selected.clear();
    this.revision += 1;
  }

  public set(notes: Iterable<MidiChannelEvent>): void {
    const next = new Set(notes);
    if (
      next.size === this.selected.size &&
      [...next].every((noteOn) => this.selected.has(noteOn))
    ) {
      return;
    }
    this.selected.clear();
    for (const noteOn of next) this.selected.add(noteOn);
    this.revision += 1;
  }
}
