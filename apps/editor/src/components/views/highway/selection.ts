import type { MidiChannelEvent } from "@midiedit/core";

export class SelectionContext {
  private readonly selected = new Set<MidiChannelEvent>();

  public get notes(): MidiChannelEvent[] {
    return Array.from(this.selected);
  }

  public get size(): number {
    return this.selected.size;
  }

  public isSelected(noteOn: MidiChannelEvent): boolean {
    return this.selected.has(noteOn);
  }

  public add(noteOn: MidiChannelEvent): void {
    this.selected.add(noteOn);
  }

  public remove(noteOn: MidiChannelEvent): void {
    this.selected.delete(noteOn);
  }

  public clear(): void {
    this.selected.clear();
  }

  public set(notes: Iterable<MidiChannelEvent>): void {
    this.selected.clear();
    for (const noteOn of notes) this.selected.add(noteOn);
  }
}
