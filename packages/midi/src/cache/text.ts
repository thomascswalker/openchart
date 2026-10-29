import { isTextEvent, MidiEvent, TextMidiEvent } from "../types";
import { IEventCacheList } from "./cache";

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
