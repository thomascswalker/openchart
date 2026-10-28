import { MetaType, MidiEvent, TempoEvent } from "../types.js";
import { IEventCacheList } from "./cache.js";

export class TempoEventCache extends IEventCacheList<TempoEvent, MidiEvent> {
  public override build(events: MidiEvent[]): void {
    this.invalidate();
    events.forEach((event) => {
      if (
        event.status !== 0xff ||
        !("type" in event) ||
        event.type !== MetaType.Tempo
      ) {
        return;
      }
      this._data.push(event as TempoEvent);
    });
    this._isBuilt = true;
    this._onChange?.();
  }
}
