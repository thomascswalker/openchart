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
} from "./types.js";
import { inRange } from "es-toolkit";
import { LyricEntry, LyricNoteCache } from "./cache/lyric.js";
import { TimeSignatureEventCache } from "./cache/timeSignature.js";
import { TempoEventCache } from "./cache/tempo.js";

/** `order` for EndOfTrack so it always sorts last on its tick. */
const END_OF_TRACK_ORDER = Number.MAX_SAFE_INTEGER;
/** `order` for a moved event so it sorts after existing events on its tick. */
const MOVED_EVENT_ORDER = Number.MAX_SAFE_INTEGER - 1;

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
    this.text.data.forEach((event) => {
      if (!isTextEvent(event) || event.type !== TextMetaType.Lyric) {
        return;
      }
      // Get the corresponding note for this lyric event (if it exists)
      const note = this.note.data.find(
        (candidate) => candidate.start === event.tick,
      );
      entries.push([event, note]);
    });
    this.lyric.build(entries);
  };

  /** Builds any invalidated event cache. Note cache first: lyrics read it. */
  rebuildAll(events: MidiEvent[]): void {
    this.note.rebuild(events);
    this.text.rebuild(events);
    this.timeSignature.rebuild(events);
    this.tempo.rebuild(events);
  }

  /** Marks every event-derived cache stale after a structural change. */
  invalidateAll(): void {
    this.note.invalidate();
    this.text.invalidate();
    this.timeSignature.invalidate();
    this.tempo.invalidate();
  }
}

export class MidiTrack {
  format: MidiFormat = 0;
  name: string = "";
  #events: MidiEvent[] = [];

  readonly #caches = new CacheMap();

  public constructor(name: string = "") {
    this.name = name;
  }

  /**
   * The track's events in file order. Each event's `tick` (absolute time) and
   * `order` (index in this array) are kept current by MidiTrack; treat them as
   * read-only and change timing through MidiTrack methods. To replace the
   * list, assign a new array — do not push/splice the returned array.
   */
  public get events(): MidiEvent[] {
    return this.#events;
  }

  /** Replaces all events. `deltaTime` wins; `tick`/`order` are derived. */
  public set events(events: MidiEvent[]) {
    this.#events = events;
    this.syncTiming();
    this.#caches.invalidateAll();
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

  public insertEventAt(tick: number, event: MidiEvent): MidiEventId {
    event.tick = tick;
    this.insertEventsAt([event]);
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
    this.ensureCaches();
    return this.#caches.noteByEventId.data.get(id);
  }

  public getTempoEvents(): TempoEvent[] {
    this.ensureCaches();
    return this.#caches.tempo.data;
  }

  public getTimeSignatureEvents(): TimeSignatureEvent[] {
    this.ensureCaches();
    return this.#caches.timeSignature.data;
  }

  public getTextEvents(): TextMidiEvent[] {
    this.ensureCaches();
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
      tick,
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
      tick,
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
      tick,
      status: 0xff,
      type,
      length: textByteLength(text),
      text: text,
    };
    this.insertEventAt(tick, event);
    return event;
  }

  public updateTextEvent(event: TextMidiEvent, text: string): boolean {
    if (!this.hasEvent(event) || !isTextEvent(event)) {
      return false;
    }
    event.text = text;
    event.length = textByteLength(text);
    this.#caches.text.invalidate();
    return true;
  }

  public moveEvent(event: MidiEvent, tick: number): boolean {
    if (!this.hasEvent(event)) {
      return false;
    }
    if (tick < 0) {
      throw new RangeError("tick must be a non-negative integer");
    }
    event.tick = tick;
    event.order = MOVED_EVENT_ORDER;
    this.commitByTick(this.#events.slice());
    return true;
  }

  /**
   * Applies a field patch to an event. A `tick` in the patch moves the event;
   * `order` is ignored because MidiTrack owns it.
   */
  public updateEvent(event: MidiEvent, patch: Partial<MidiEvent>): boolean {
    if (!this.#events.includes(event)) {
      return false;
    }
    const fields: Partial<MidiEvent> = { ...patch };
    const tick = fields.tick;
    delete fields.tick;
    delete fields.order;
    Object.assign(event, fields);
    if (tick !== undefined && tick !== event.tick) {
      return this.moveEvent(event, tick);
    }
    if ("deltaTime" in fields) {
      this.syncTiming();
    }
    this.#caches.invalidateAll();
    return true;
  }

  /**
   * Resolves an event to the actual event instance within the track.
   * @param event The event to resolve.
   * @returns The resolved event if it exists in the track, otherwise undefined.
   */
  private hasEvent(event: MidiEvent): boolean {
    return this.events.includes(event);
  }

  /** Recomputes `tick` and `order` from `deltaTime`. */
  private syncTiming(): void {
    let tick = 0;
    this.#events.forEach((event, index) => {
      tick += event.deltaTime;
      event.tick = tick;
      event.order = index;
    });
  }

  /** Bumps EndOfTrack to at least the last event's tick and sorts it last. */
  private keepEndOfTrackLast(events: MidiEvent[]): void {
    const finalTick = events.reduce(
      (maximum, event) =>
        isEndOfTrack(event) ? maximum : Math.max(maximum, event.tick),
      0,
    );
    for (const event of events) {
      if (isEndOfTrack(event)) {
        event.tick = Math.max(event.tick, finalTick);
        event.order = END_OF_TRACK_ORDER;
      }
    }
  }

  /**
   * Commits `events` using each event's `tick` as authoritative: sorts by
   * (tick, order), derives `deltaTime`, writes the result into the track in
   * place and renumbers `order`. Together with the `events` setter this is
   * the only place timing is recomputed.
   */
  private commitByTick(events: MidiEvent[]): void {
    this.keepEndOfTrackLast(events);
    events.sort(sortEvents);
    let previousTick = 0;
    for (const event of events) {
      event.deltaTime = event.tick - previousTick;
      previousTick = event.tick;
    }
    this.#events.splice(0, this.#events.length, ...events);
    this.#events.forEach((event, index) => {
      event.order = index;
    });
    this.#caches.invalidateAll();
  }

  /** Builds any stale caches from the current events. */
  private ensureCaches(): void {
    this.#caches.rebuildAll(this.#events);
  }

  private removeEventId(event: MidiEvent): void {
    this.#caches.eventId.removeEventId(event);
  }

  public getNoteRevision(): number {
    return this.#caches.note.revision;
  }

  public getAbsoluteTickAt(eventIndex: number): number {
    if (eventIndex < 0 || eventIndex > this.events.length) {
      throw new RangeError("eventIndex is outside the MIDI track");
    }

    return eventIndex === 0 ? 0 : this.#events[eventIndex - 1]!.tick;
  }

  public getInsertionIndexAt(absoluteTick: number): number {
    if (absoluteTick < 0) {
      throw new RangeError("absoluteTick must be a non-negative integer");
    }

    const endOfTrackIndex = this.#events.findIndex(isEndOfTrack);
    const eventLimit =
      endOfTrackIndex < 0 ? this.#events.length : endOfTrackIndex;
    const index = this.#events.findIndex(
      (event, eventIndex) =>
        eventIndex < eventLimit && event.tick > absoluteTick,
    );
    return index < 0 ? eventLimit : index;
  }

  /**
   * Inserts events at their own absolute `tick` in one pass. Inserted events
   * sort after existing events on the same tick, in the given order, and a
   * trailing EndOfTrack is bumped so it stays last. Shared by note creation
   * and single meta-event insertion (tempo/time-signature events).
   */
  public insertEventsAt(events: readonly MidiEvent[]): void {
    for (const event of events) {
      if (event.tick < 0) {
        throw new RangeError("tick must be a non-negative integer");
      }
    }
    const firstNewOrder = this.#events.length;
    events.forEach((event, index) => {
      event.order = firstNewOrder + index;
    });
    this.commitByTick([...this.#events, ...events]);
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
      tick: startTick,
      status: 0x90 | channel,
      channel,
      messageType: ChannelMessage.NoteOn,
      data1: pitch,
      data2: velocity,
    };

    const noteOff: MidiChannelEvent = {
      deltaTime: 0,
      tick: endTick,
      status: 0x80 | channel,
      channel,
      messageType: ChannelMessage.NoteOff,
      data1: pitch,
      data2: 0,
    };

    this.insertEventsAt([noteOn, noteOff]);

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
      tick,
      status: 0x90 | channel,
      channel,
      messageType: ChannelMessage.NoteOn,
      data1: pitch,
      data2: velocity,
    };
    const noteOff: MidiChannelEvent = {
      deltaTime: 0,
      tick: tick + duration,
      status: 0x80 | channel,
      channel,
      messageType: ChannelMessage.NoteOff,
      data1: pitch,
      data2: 0,
    };
    this.insertEventsAt([noteOn, noteOff]);
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

    this.commitByTick(this.#events.filter((event) => !removed.has(event)));
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

    if (!this.#events.includes(currentNote.noteOn)) return false;

    currentNote.noteOn.data1 = pitch;
    currentNote.noteOff.data1 = pitch;
    currentNote.noteOn.data2 = velocity;
    currentNote.pitch = pitch;
    currentNote.pitch = pitch;
    currentNote.velocity = velocity;
    currentNote.start = start;
    currentNote.end = end;
    if (note !== currentNote) {
      note.pitch = pitch;
      note.pitch = pitch;
      note.velocity = velocity;
      note.start = start;
      note.end = end;
    }

    currentNote.noteOn.tick = start;
    currentNote.noteOff.tick = end;
    this.commitByTick(this.#events.slice());
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
    if (!this.hasEvent(event)) {
      return false;
    }

    this.removeEventId(event);
    this.commitByTick(this.#events.filter((candidate) => candidate !== event));
    return true;
  }

  public removeEventById(id: MidiEventId): boolean {
    const event = this.#caches.eventId.getEventById(id);
    return event ? this.removeEvent(event) : false;
  }

  public getNotes(options: GetNotesOptions = {}): MidiNote[] {
    this.ensureCaches();

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
