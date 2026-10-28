import { isTextEvent, MidiEvent, TextMidiEvent } from "../types.js";
import { IEventCacheList } from "./cache.js";

export class TextEventCache extends IEventCacheList<TextMidiEvent, MidiEvent> {
  public override build(events: MidiEvent[]): void {
    this.invalidate();
    events.map((event) => {
      if (!isTextEvent(event)) {
        return;
      }
      this._data.push(event as TextMidiEvent);
    });
    this._isBuilt = true;
    this._onChange?.();
  }
}
