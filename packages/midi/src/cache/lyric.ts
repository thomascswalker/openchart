import { isTextEvent, MidiNote, TextMidiEvent } from "../types";
import { IEventCacheList } from "./cache";

export interface LyricNote {
  event: TextMidiEvent;
  note?: MidiNote;
}

export type LyricEntry = [TextMidiEvent, MidiNote | undefined];

/**
 * A cache for lyric notes, which are text events optionally associated with a
 * MIDI note (pair of NoteOn and NoteOff events).
 */
export class LyricNoteCache extends IEventCacheList<LyricNote, LyricEntry> {
  public override build(entries: LyricEntry[]): void {
    this.invalidate();
    entries.map(([event, note]) => {
      if (!isTextEvent(event)) {
        return;
      }
      this._data.push({
        event: event as TextMidiEvent,
        note: note,
      });
    });
    this._isBuilt = true;
    this._onChange?.();
  }
}
