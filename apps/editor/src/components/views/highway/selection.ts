import type { MidiChannelEvent } from "@openchart/midi";
import { BaseSelection } from "../shared/selection";

export class SelectionContext extends BaseSelection<MidiChannelEvent> {
  private revision = 0;

  public getRevision(): number {
    return this.revision;
  }

  public remove(noteOn: MidiChannelEvent): void {
    this.delete(noteOn);
  }

  protected override onChanged(): void {
    this.revision += 1;
  }
}
