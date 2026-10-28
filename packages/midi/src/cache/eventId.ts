import { MidiEvent, MidiEventId, MidiNote } from "../types.js";
import { IEventCacheMap } from "./cache.js";

export class EventIdCache {
  #eventIds = new WeakMap<MidiEvent, MidiEventId>();
  #eventsById = new Map<MidiEventId, MidiEvent>();
  #nextEventId = 0;

  public getEventId(event: MidiEvent): MidiEventId {
    let id = this.#eventIds.get(event);
    if (!id) {
      id = `event-${this.#nextEventId++}`;
      this.#eventIds.set(event, id);
    }

    this.#eventsById.set(id, event);
    return id;
  }

  public getEventById(id: MidiEventId): MidiEvent | undefined {
    return this.#eventsById.get(id);
  }

  public removeEventId(event: MidiEvent): void {
    const id = this.#eventIds.get(event);
    if (id) {
      this.#eventsById.delete(id);
    }
  }

  public clone(events: ReadonlyMap<MidiEvent, MidiEvent>): EventIdCache {
    const copy = new EventIdCache();
    copy.#nextEventId = this.#nextEventId;

    for (const [id, event] of this.#eventsById) {
      const clonedEvent = events.get(event);
      if (clonedEvent) {
        copy.#eventIds.set(clonedEvent, id);
        copy.#eventsById.set(id, clonedEvent);
      }
    }

    return copy;
  }
}

type EventIdEntry = [MidiEventId, MidiNote];
export class NoteByEventIdCache extends IEventCacheMap<
  MidiEventId,
  MidiNote,
  EventIdEntry
> {
  public override build(entries: EventIdEntry[]): void {
    this.invalidate();
    entries.map(([eventId, note]) => this._data.set(eventId, note));
    this._isBuilt = true;
    this._onChange?.();
  }
}
