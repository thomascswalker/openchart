import { MidiNote } from "../types.js";
import { IEventCacheMap } from "./cache.js";

export class PitchCache extends IEventCacheMap<number, MidiNote[], MidiNote> {
  public override build(notes: MidiNote[]): void {
    this.invalidate();
    notes.map((note) => {
      const notesForPitch = this._data.get(note.pitch) ?? [];
      notesForPitch.push(note);
      this._data.set(note.pitch, notesForPitch);
    });
    this._isBuilt = true;
    this._onChange?.();
  }
}
