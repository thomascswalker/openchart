import {
  MidiChannelEvent,
  MidiNote,
  MidiEvent,
  TextMidiEvent,
  isNoteEvent,
  ChannelMessage,
} from "../types.js";
import { IEventCacheList } from "./cache.js";

interface PendingNote {
  pitch: number;
  velocity: number;
  startTick: number;
  noteOn: MidiChannelEvent;
}

export class NoteCache extends IEventCacheList<MidiNote, MidiEvent> {
  public textEventSources = new WeakMap<TextMidiEvent, MidiEvent>();

  public override build(events: MidiEvent[]): void {
    this._data = [];
    this._isBuilt = false;

    const activeNotes = new Map<number, PendingNote[]>();
    const notes: MidiNote[] = [];
    let previousNote: MidiNote | undefined;

    for (const event of events) {
      if (!isNoteEvent(event)) {
        continue;
      }

      const pitch = event.data1;
      const velocity = event.data2 ?? 0;

      const isNoteOn =
        event.messageType === ChannelMessage.NoteOn && velocity > 0;

      const isNoteOff =
        event.messageType === ChannelMessage.NoteOff ||
        (event.messageType === ChannelMessage.NoteOn && velocity === 0);

      if (isNoteOn) {
        const pending: PendingNote = {
          pitch,
          velocity,
          startTick: event.tick,
          noteOn: event,
        };

        const notesForPitch = activeNotes.get(pitch) ?? [];
        notesForPitch.push(pending);
        activeNotes.set(pitch, notesForPitch);

        continue;
      }

      if (isNoteOff) {
        const notesForPitch = activeNotes.get(pitch);

        if (!notesForPitch || notesForPitch.length === 0) {
          console.error(`Unmatched NoteOff event: ${notesForPitch}`);
          continue;
        }

        const pending = notesForPitch.shift()!;

        const newNote = {
          pitch: pending.pitch,
          velocity: pending.velocity,
          start: pending.startTick,
          end: event.tick,
          noteOn: pending.noteOn,
          noteOff: event,
          previous: previousNote,
        } as MidiNote;

        notes.push(newNote);

        // Store the previous note which is not the same tick position
        // as this current note.
        if (previousNote && previousNote.start !== newNote.start) {
          previousNote = newNote;
        }

        if (notesForPitch.length === 0) {
          activeNotes.delete(pitch);
        }
      }
    }
    notes.sort((a, b) => a.start - b.start);
    this._data = notes;
    this._isBuilt = true;
    this._onChange?.();
  }
}
