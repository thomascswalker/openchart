import { NoteByEventIdCache } from "./cache/eventId.js";
import { PitchCache } from "./cache/pitch.js";
import { NoteCache } from "./cache/note.js";
import { EventIdCache } from "./cache/eventId.js";
import { TextEventCache } from "./cache/text.js";
import {
  textByteLength,
  encodeMidiEvent,
  concatBytes,
  writeAscii,
  writeUInt32BE,
} from "./codec.js";
import {
  MidiFormat,
  MidiEvent,
  MidiNote,
  MidiEventId,
  TextMidiEvent,
  MidiSysExEvent,
  MidiChannelEvent,
  ChannelMessage,
  EventRecord,
  TempoEvent,
  MetaType,
  sortEvents,
  TimeSignatureEvent,
  TextMetaType,
  GetNotesOptions,
  InsertNoteOptions,
  NotePatchFields,
  AddNoteResult,
  isTextEvent,
  isEndOfTrack,
  TextRecord,
} from "./types.js";
import { inRange } from "es-toolkit";
import { LyricEntry, LyricNoteCache } from "./cache/lyric.js";
import { TimeSignatureEventCache } from "./cache/timeSignature.js";
import { TempoEventCache } from "./cache/tempo.js";

class CacheMap {
  note: NoteCache;
  pitch: PitchCache;
  noteByEventId: NoteByEventIdCache;
  eventId: EventIdCache;
  text: TextEventCache;
  lyric: LyricNoteCache;
  timeSignature: TimeSignatureEventCache;
  tempo: TempoEventCache;

  constructor() {
    // Channel events
    this.note = new NoteCache(this.onNoteCacheChange);
    this.pitch = new PitchCache();
    this.eventId = new EventIdCache();
    this.noteByEventId = new NoteByEventIdCache();

    // Text events
    this.text = new TextEventCache(this.onTextEventCacheChange);
    this.lyric = new LyricNoteCache();

    // Other meta events
    this.timeSignature = new TimeSignatureEventCache();
    this.tempo = new TempoEventCache();
  }

  private onNoteCacheChange = (): void => {
    this.pitch.build(this.note.data);
    this.noteByEventId.build(
      this.note.data.map((note) => [
        this.eventId.getEventId(note.noteOn),
        note,
      ]),
    );
  };

  private onTextEventCacheChange = (): void => {
    const entries: LyricEntry[] = [];
    let currentTime: number = 0;
    this.text.data.forEach((event) => {
      currentTime += event.deltaTime;
      if (!isTextEvent(event) || event.type !== TextMetaType.Lyric) {
        return;
      }
      // Get the corresponding note for this lyric event (if it exists)
      const note = this.note.data.find((note) => note.start === currentTime);
      entries.push([event, note]);
    });
    this.lyric.build(entries);
  };

  buildAll(events: MidiEvent[]): void {
    this.note.build(events);
    this.text.build(events);
    this.timeSignature.build(events);
    this.tempo.build(events);
  }
}

export class MidiTrack {
  format: MidiFormat = 0;
  name: string = "";
  events: MidiEvent[] = [];

  readonly #caches = new CacheMap();

  public constructor(name: string = "") {
    this.name = name;
  }

  public clone(): MidiTrack {
    const track = new MidiTrack(this.name);
    track.format = this.format;
    track.events = this.events.map((event) => {
      let clonedEvent: MidiEvent;
      if (event.status === 0xff) {
        clonedEvent = { ...event } as MidiEvent;
      } else if (event.status === 0xf0 || event.status === 0xf7) {
        const sysExEvent = event as MidiSysExEvent;
        clonedEvent = { ...sysExEvent, data: sysExEvent.data.slice() };
      } else {
        clonedEvent = { ...event };
      }
      return clonedEvent;
    });
    const clonedEvents = new Map<MidiEvent, MidiEvent>();
    this.events.forEach((event, index) => {
      clonedEvents.set(event, track.events[index]!);
    });
    track.#caches.eventId = this.#caches.eventId.clone(clonedEvents);
    return track;
  }

  public getAllEventRecords(
    filter?: (event: MidiEvent) => boolean,
  ): EventRecord[] {
    let tick = 0;

    const records = this.events.map((event, order) => {
      tick += event.deltaTime;
      return { event, tick, order };
    });
    return filter ? records.filter((record) => filter(record.event)) : records;
  }

  public getTextEventRecords(): TextRecord[] {
    return this.getAllEventRecords(isTextEvent) as TextRecord[];
  }

  public insertEventAt(tick: number, event: MidiEvent): MidiEventId {
    this.insertEventsAt([{ tick, event }]);
    return this.#caches.eventId.getEventId(event);
  }

  public updateEventAt(id: MidiEventId, patch: Partial<MidiEvent>): boolean {
    const event = this.#caches.eventId.getEventById(id);
    return event ? this.updateEvent(event, patch) : false;
  }

  public moveEventById(id: MidiEventId, tick: number): boolean {
    const event = this.#caches.eventId.getEventById(id);
    return event ? this.moveEvent(event, tick) : false;
  }

  public getEventId(event: MidiEvent): MidiEventId {
    return this.#caches.eventId.getEventId(event);
  }

  public getEventById(id: MidiEventId): MidiEvent | undefined {
    return this.#caches.eventId.getEventById(id);
  }

  public getNoteByEventId(id: MidiEventId): MidiNote | undefined {
    if (!this.#caches.note.isBuilt) {
      this.#caches.buildAll(this.events);
    }
    return this.#caches.noteByEventId.data.get(id);
  }

  public getTempoEvents(): TempoEvent[] {
    return this.#caches.tempo.data;
  }

  public getTimeSignatureEvents(): TimeSignatureEvent[] {
    return this.#caches.timeSignature.data;
  }

  public getTextEvents(): TextMidiEvent[] {
    return this.#caches.text.data;
  }

  public addTempoEvent(tick: number, bpm: number): TempoEvent {
    if (tick < 0) {
      throw new RangeError("tick must be a non-negative integer");
    }
    const microsecondsPerQuarterNote = Math.round(60000000 / bpm);
    const data = new Uint8Array(3);
    data[0] = (microsecondsPerQuarterNote >> 16) & 0xff;
    data[1] = (microsecondsPerQuarterNote >> 8) & 0xff;
    data[2] = microsecondsPerQuarterNote & 0xff;
    const event: TempoEvent = {
      deltaTime: 0,
      status: 0xff,
      type: MetaType.Tempo,
      length: data.length,
      microsecondsPerQuarterNote,
    };
    this.insertEventAt(tick, event);
    return event;
  }

  public addTimeSignatureEvent(
    tick: number,
    numerator: number = 4,
    denominator: number = 4,
  ): TimeSignatureEvent {
    if (tick < 0) {
      throw new RangeError("tick must be a non-negative integer");
    }
    const event: TimeSignatureEvent = {
      deltaTime: 0,
      status: 0xff,
      type: MetaType.TimeSignature,
      length: 4,
      numerator,
      denominator,
    };
    this.insertEventAt(tick, event);
    return event;
  }

  /** Creates a text-bearing meta event at an absolute tick. */
  public addTextEvent(
    type: TextMetaType,
    tick: number,
    text: string,
  ): TextMidiEvent {
    if (tick < 0) {
      throw new RangeError("tick must be a non-negative integer");
    }
    if (!text.trim()) {
      throw new Error("Text events must contain text");
    }
    const event: TextMidiEvent = {
      deltaTime: 0,
      status: 0xff,
      type,
      length: textByteLength(text),
      text: text,
    };
    this.insertEventAt(tick, event);
    return event;
  }

  public updateTextEvent(event: TextMidiEvent, text: string): boolean {
    const source = this.resolveEvent(event) as TextMidiEvent | undefined;
    if (!source || !isTextEvent(source)) {
      return false;
    }
    source.text = text;
    source.length = textByteLength(text);
    event.text = text;
    event.length = source.length;
    this.#caches.text.invalidate();
    return true;
  }

  public moveEvent(event: MidiEvent, tick: number): boolean {
    const source = this.resolveEvent(event);
    if (!source) {
      return false;
    }
    if (tick < 0) {
      throw new RangeError("tick must be a non-negative integer");
    }
    const timedEvents = this.getAllEventRecords();
    const timed = timedEvents.find((item) => item.event === source);
    if (!timed) return false;
    timed.tick = tick;
    timed.order = Number.MAX_SAFE_INTEGER;
    this.replaceTimedEvents(this.keepEndOfTrackLast(timedEvents));
    return true;
  }

  public updateEvent(event: MidiEvent, patch: Partial<MidiEvent>): boolean {
    if (!this.events.includes(event)) return false;
    Object.assign(event, patch);
    this.#caches.note.invalidate();
    return true;
  }

  /**
   * Resolves an event to the actual event instance within the track.
   * @param event The event to resolve.
   * @returns The resolved event if it exists in the track, otherwise undefined.
   */
  private resolveEvent(event: MidiEvent): MidiEvent | undefined {
    return this.events.includes(event) ? event : undefined;
  }

  private replaceTimedEvents(timedEvents: EventRecord[]): void {
    let previousTick = 0;

    timedEvents.forEach((item) => {
      if (item.tick < previousTick) {
        throw new Error("MIDI events must be ordered by absolute tick");
      }

      item.event.deltaTime = item.tick - previousTick;
      previousTick = item.tick;
    });

    this.events.splice(
      0,
      this.events.length,
      ...timedEvents.map(({ event }) => event),
    );
    this.#caches.note.invalidate();
  }

  private removeEventId(event: MidiEvent): void {
    this.#caches.eventId.removeEventId(event);
  }

  public getNoteRevision(): number {
    return this.#caches.note.revision;
  }

  private keepEndOfTrackLast(events: EventRecord[]): EventRecord[] {
    const finalTick = events
      .filter(({ event }) => !isEndOfTrack(event))
      .reduce((maximum, item) => Math.max(maximum, item.tick), 0);
    for (const item of events) {
      if (isEndOfTrack(item.event)) {
        item.tick = Math.max(item.tick, finalTick);
        item.order = Number.MAX_SAFE_INTEGER;
      }
    }
    return events.sort(sortEvents);
  }

  public getAbsoluteTickAt(eventIndex: number): number {
    if (eventIndex < 0 || eventIndex > this.events.length) {
      throw new RangeError("eventIndex is outside the MIDI track");
    }

    let tick = 0;

    for (let index = 0; index < eventIndex; index++) {
      tick += this.events.at(index)?.deltaTime || 0;
    }

    return tick;
  }

  public getInsertionIndexAt(absoluteTick: number): number {
    if (absoluteTick < 0) {
      throw new RangeError("absoluteTick must be a non-negative integer");
    }

    let tick = 0;
    const endOfTrackIndex = this.events.findIndex(isEndOfTrack);

    const eventLimit =
      endOfTrackIndex < 0 ? this.events.length : endOfTrackIndex;

    for (let index = 0; index < eventLimit; index++) {
      tick += this.events.at(index)?.deltaTime || 0;

      if (tick > absoluteTick) {
        return index;
      }
    }

    return eventLimit;
  }

  /**
   * Inserts one or more events at absolute ticks in a single pass, bumping
   * any trailing EndOfTrack event so it stays last. Shared by note creation
   * and single meta-event insertion (tempo/time-signature events).
   */
  public insertEventsAt(entries: { tick: number; event: MidiEvent }[]): void {
    const timedEvents = this.getAllEventRecords();
    const firstNewOrder = timedEvents.length;

    entries.forEach(({ tick, event }, index) => {
      if (tick < 0) {
        throw new RangeError("tick must be a non-negative integer");
      }

      timedEvents.push({ event, tick, order: firstNewOrder + index });
    });

    const finalTick = timedEvents
      .filter(({ event }) => !isEndOfTrack(event))
      .reduce((maximum, timedEvent) => Math.max(maximum, timedEvent.tick), 0);

    timedEvents
      .filter(({ event }) => isEndOfTrack(event))
      .forEach((event) => {
        event.tick = Math.max(event.tick, finalTick);
        event.order = Number.MAX_SAFE_INTEGER;
      });

    timedEvents.sort(sortEvents);

    this.replaceTimedEvents(timedEvents);
  }

  public addNote(
    pitch: number,
    startDelta: number,
    velocity: number = 100,
    endDelta: number = 240,
    insertAt: number = this.events.length,
  ): AddNoteResult {
    if (pitch < 0 || pitch > 127) {
      throw new RangeError("MIDI note must be between 0 and 127");
    }

    if (startDelta < 0) {
      throw new RangeError("startDelta must be a non-negative integer");
    }

    if (endDelta < 0) {
      throw new RangeError("endDelta must be a non-negative integer");
    }

    if (velocity < 1 || velocity > 127) {
      throw new RangeError("NoteOn velocity must be between 1 and 127");
    }

    if (insertAt < 0 || insertAt > this.events.length) {
      throw new RangeError("insertAt is outside the MIDI track");
    }

    const startTick = this.getAbsoluteTickAt(insertAt) + startDelta;
    const endTick = startTick + endDelta;
    const channel = 0;

    const noteOn: MidiChannelEvent = {
      deltaTime: 0,
      status: 0x90 | channel,
      channel,
      messageType: ChannelMessage.NoteOn,
      data1: pitch,
      data2: velocity,
    };

    const noteOff: MidiChannelEvent = {
      deltaTime: 0,
      status: 0x80 | channel,
      channel,
      messageType: ChannelMessage.NoteOff,
      data1: pitch,
      data2: 0,
    };

    this.insertEventsAt([
      { tick: startTick, event: noteOn },
      { tick: endTick, event: noteOff },
    ]);

    return { noteOn, noteOff };
  }

  /** Inserts a note at an absolute tick and returns its cached note snapshot. */
  public insertNote(options: InsertNoteOptions): MidiNote {
    const { tick, pitch, duration, velocity = 100, channel = 0 } = options;
    if (tick < 0) {
      throw new RangeError("tick must be a non-negative integer");
    }
    if (duration < 1) {
      throw new RangeError("duration must be a positive integer");
    }
    if (pitch < 0 || pitch > 127) {
      throw new RangeError("MIDI note must be between 0 and 127");
    }
    if (velocity < 1 || velocity > 127) {
      throw new RangeError("NoteOn velocity must be between 1 and 127");
    }
    if (channel < 0 || channel > 15) {
      throw new RangeError("MIDI channel must be between 0 and 15");
    }

    const noteOn: MidiChannelEvent = {
      deltaTime: 0,
      status: 0x90 | channel,
      channel,
      messageType: ChannelMessage.NoteOn,
      data1: pitch,
      data2: velocity,
    };
    const noteOff: MidiChannelEvent = {
      deltaTime: 0,
      status: 0x80 | channel,
      channel,
      messageType: ChannelMessage.NoteOff,
      data1: pitch,
      data2: 0,
    };
    this.insertEventsAt([
      { tick, event: noteOn },
      { tick: tick + duration, event: noteOff },
    ]);
    const note = this.getNoteByEventId(this.#caches.eventId.getEventId(noteOn));
    if (!note) throw new Error("Inserted note was not found in the note cache");
    return note;
  }

  public removeNote(
    noteOn: MidiChannelEvent,
    noteOff: MidiChannelEvent,
  ): boolean {
    if (noteOn === noteOff || noteOn.data1 !== noteOff.data1) {
      return false;
    }

    if (this.events.indexOf(noteOn) < 0 || this.events.indexOf(noteOff) < 0) {
      return false;
    }

    const isNoteOn =
      noteOn.messageType === ChannelMessage.NoteOn && (noteOn.data2 ?? 0) > 0;

    const isNoteOff =
      noteOff.messageType === ChannelMessage.NoteOff ||
      (noteOff.messageType === ChannelMessage.NoteOn &&
        (noteOff.data2 ?? 0) === 0);

    if (!isNoteOn || !isNoteOff) {
      return false;
    }

    const removed = new Set<MidiEvent>([noteOn, noteOff]);
    this.removeEventId(noteOn);
    this.removeEventId(noteOff);

    const remaining = this.getAllEventRecords().filter(
      ({ event }) => !removed.has(event),
    );

    this.replaceTimedEvents(remaining);
    return true;
  }

  /**
   * Sets a note's pitch in place, updating both its NoteOn/NoteOff events
   * and invalidating the note cache so subsequent getNotes() calls rebuild.
   */
  public setNotePitch(note: MidiNote, pitch: number): boolean {
    if (!inRange(pitch, 0, 127)) {
      throw new RangeError("MIDI note must be between 0 and 127");
    }
    return this.updateNote(note, { pitch });
  }

  /** Atomically updates note properties and rebuilds timed events once. */
  public updateNote(note: MidiNote, patch: NotePatchFields): boolean {
    const currentNote = this.getNoteByEventId(
      this.#caches.eventId.getEventId(note.noteOn),
    );
    if (!currentNote || !this.events.includes(currentNote.noteOff)) {
      return false;
    }

    const pitch = patch.pitch ?? currentNote.pitch;
    const velocity = patch.velocity ?? currentNote.velocity;
    const start = patch.start ?? currentNote.start;
    const duration = patch.duration ?? currentNote.end - currentNote.start;
    const end = start + duration;
    if (!inRange(pitch, 0, 127)) {
      throw new RangeError("MIDI note must be between 0 and 127");
    }
    if (!inRange(velocity, 1, 127)) {
      throw new RangeError("NoteOn velocity must be between 1 and 127");
    }
    if (start < 0) {
      throw new RangeError("startTick must be a non-negative integer");
    }
    if (duration < 1) {
      throw new RangeError("duration must be a positive integer");
    }

    const timedEvents = this.getAllEventRecords();
    const noteOnTimed = timedEvents.find(
      (timedEvent) => timedEvent.event === currentNote.noteOn,
    );
    const noteOffTimed = timedEvents.find(
      (timedEvent) => timedEvent.event === currentNote.noteOff,
    );
    if (!noteOnTimed || !noteOffTimed) return false;

    currentNote.noteOn.data1 = pitch;
    currentNote.noteOff.data1 = pitch;
    currentNote.noteOn.data2 = velocity;
    currentNote.note = pitch;
    currentNote.pitch = pitch;
    currentNote.velocity = velocity;
    currentNote.start = start;
    currentNote.end = end;
    if (note !== currentNote) {
      note.note = pitch;
      note.pitch = pitch;
      note.velocity = velocity;
      note.start = start;
      note.end = end;
    }

    noteOnTimed.tick = start;
    noteOffTimed.tick = end;
    this.replaceTimedEvents(this.keepEndOfTrackLast(timedEvents));
    return true;
  }

  /**
   * Resizes a note by moving its NoteOff to `durationTicks` after its NoteOn,
   * re-sorting events by absolute tick and invalidating the note cache.
   */
  public setNoteDuration(note: MidiNote, durationTicks: number): boolean {
    if (durationTicks < 1) {
      throw new RangeError("durationTicks must be a positive integer");
    }
    const currentNote = this.getNoteByEventId(
      this.#caches.eventId.getEventId(note.noteOn),
    );
    return currentNote
      ? this.updateNote(note, { duration: durationTicks })
      : false;
  }

  /**
   * Moves a note to `startTick`, shifting its NoteOn/NoteOff by the same
   * delta so duration is preserved, then re-sorting and invalidating the
   * note cache.
   */
  public setNoteStart(note: MidiNote, startTick: number): boolean {
    if (startTick < 0) {
      throw new RangeError("startTick must be a non-negative integer");
    }
    const currentNote = this.getNoteByEventId(
      this.#caches.eventId.getEventId(note.noteOn),
    );
    if (!currentNote) {
      return false;
    }
    const duration = currentNote.end - currentNote.start;
    return this.updateNote(note, {
      start: startTick,
      duration,
    });
  }

  public removeEvent(event: MidiEvent): boolean {
    const source = this.resolveEvent(event);
    if (!source) {
      return false;
    }

    this.removeEventId(source);
    const remaining = this.getAllEventRecords().filter(
      (timedEvent) => timedEvent.event !== source,
    );

    this.replaceTimedEvents(remaining);
    return true;
  }

  public removeEventById(id: MidiEventId): boolean {
    const event = this.#caches.eventId.getEventById(id);
    return event ? this.removeEvent(event) : false;
  }

  public getNotes(options: GetNotesOptions = {}): MidiNote[] {
    this.#caches.note.rebuild(this.events);

    if (options.pitch) {
      const { low, high } = options.pitch;
      const rangeNotes: MidiNote[] = [];

      for (const [pitch, notesForPitch] of this.#caches.pitch.data) {
        if (pitch >= low && pitch < high) {
          rangeNotes.push(...notesForPitch);
        }
      }

      rangeNotes.sort((a, b) => a.start - b.start);
      return rangeNotes;
    }

    return this.#caches.note.data;
  }

  public validate(): void {
    const endOfTrackIndices = this.events
      .map((event, index) => (isEndOfTrack(event) ? index : -1))
      .filter((index) => index >= 0);

    if (
      endOfTrackIndices.length > 1 ||
      (endOfTrackIndices.length === 1 &&
        endOfTrackIndices[0] !== this.events.length - 1)
    ) {
      throw new Error("EndOfTrack must be the final event in a MIDI track");
    }
  }

  public toBuffer(): Uint8Array {
    this.validate();

    const eventBytes = this.events.map(encodeMidiEvent);
    const body = concatBytes(eventBytes);
    const chunk = new Uint8Array(8);

    writeAscii(chunk, 0, "MTrk");
    writeUInt32BE(chunk, 4, body.length);

    return concatBytes([chunk, body]);
  }
}
