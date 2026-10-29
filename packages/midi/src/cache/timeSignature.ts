import { MetaType, MidiEvent, TimeSignatureEvent } from "../types";
import { IEventCacheList } from "./cache";

export class TimeSignatureEventCache extends IEventCacheList<
  TimeSignatureEvent,
  MidiEvent
> {
  public override build(events: MidiEvent[]): void {
    this.invalidate();
    events.forEach((event) => {
      if (
        event.status !== 0xff ||
        !("type" in event) ||
        event.type !== MetaType.TimeSignature
      ) {
        return;
      }
      this._data.push(event as TimeSignatureEvent);
    });
    this._isBuilt = true;
    this._onChange?.();
  }
}
