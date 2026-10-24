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
  MidiMetaEvent,
  MidiSysExEvent,
  MidiChannelEvent,
  ChannelMessage,
  TimedMidiEvent,
  TimedEventRecord,
  TempoEvent,
  MetaType,
  sortEvents,
  TimeSignatureEvent,
  TextMetaType,
  GetNotesOptions,
} from "./types.js";

export class MidiTrack {
  format: MidiFormat = 0;
  name: string = "";
  events: MidiEvent[] = [];

  private noteCache: MidiNote[] | null = null;
  private noteCacheByPitch: Map<number, MidiNote[]> | null = null;
  private noteCacheByEventId: Map<MidiEventId, MidiNote> | null = null;
  private noteRevision = 0;
  private readonly eventIds = new WeakMap<object, MidiEventId>();
  private readonly eventsById = new Map<MidiEventId, MidiEvent>();
  private readonly textEventSources = new WeakMap<
    TextMidiEvent,
    TextMidiEvent
  >();
  private nextEventId = 1;

  public constructor(name: string = "") {
    this.name = name;
  }

  public clone(): MidiTrack {
    const track = new MidiTrack(this.name);
    track.format = this.format;
    track.events = this.events.map((event) => {
      if (event.status === 0xff) {
        if ("text" in event) return { ...event };
        const metaEvent = event as MidiMetaEvent;
        return { ...metaEvent };
      }
      if (event.status === 0xf0 || event.status === 0xf7) {
        const sysExEvent = event as MidiSysExEvent;
        return { ...sysExEvent, data: sysExEvent.data.slice() };
      }
      return { ...event };
    });
    this.events.forEach((event, index) => {
      const clonedEvent = track.events[index];
      if (clonedEvent) {
        const id = this.getEventId(event);
        track.eventIds.set(clonedEvent, id);
        track.eventsById.set(id, clonedEvent);
      }
    });
    track.nextEventId = this.nextEventId;
    return track;
  }

  public getChannelEvents(): MidiChannelEvent[] {
    return this.events.filter(
      (event) => event.status < 0xff,
    ) as MidiChannelEvent[];
  }

  public getMetaEvents(): Array<MidiMetaEvent | TextMidiEvent> {
    return this.events.filter((event) => event.status === 0xff) as Array<
      MidiMetaEvent | TextMidiEvent
    >;
  }

  public getSysExEvents(): MidiSysExEvent[] {
    return this.events.filter(
      (event) => event.status === 0xf0 || event.status === 0xf7,
    ) as MidiSysExEvent[];
  }

  public getNoteEvents(): MidiChannelEvent[] {
    return this.getChannelEvents().filter((event) =>
      [ChannelMessage.NoteOn, ChannelMessage.NoteOff].includes(
        event.messageType,
      ),
    );
  }

  public getNoteEventsInPitchRange(
    low: number,
    high: number,
  ): MidiChannelEvent[] {
    return this.getNoteEvents().filter(
      (event) => low <= event.data1 && event.data1 < high,
    );
  }

  public getTimedEvents(): TimedMidiEvent[] {
    return this.getTimedEventRecords().map(({ event, tick, order }) => ({
      ...event,
      tick,
      order,
    })) as TimedMidiEvent[];
  }

  private getTimedEventRecords(): TimedEventRecord[] {
    let tick = 0;

    return this.events.map((event, order) => {
      tick += event.deltaTime;
      return { event, tick, order };
    });
  }

  public getEventId(event: MidiEvent): MidiEventId {
    let id = this.eventIds.get(event);
    if (!id) {
      id = `event-${this.nextEventId++}`;
      this.eventIds.set(event, id);
      this.eventsById.set(id, event);
    }
    return id;
  }

  public getEventById(id: MidiEventId): MidiEvent | undefined {
    return this.eventsById.get(id);
  }

  /** Returns the cached note paired with a NoteOn event ID, if it exists. */
  public getNoteByEventId(id: MidiEventId): MidiNote | null {
    if (this.noteCache === null || this.noteCacheByEventId === null) {
      this.buildNoteCache();
    }
    return this.noteCacheByEventId!.get(id) ?? null;
  }

  public insertEventAt(tick: number, event: MidiEvent): MidiEventId {
    this.insertEventsAt([{ tick, event }]);
    return this.getEventId(event);
  }

  public updateEventAt(id: MidiEventId, patch: Partial<MidiEvent>): boolean {
    const event = this.getEventById(id);
    return event ? this.updateEvent(event, patch) : false;
  }

  public moveEventById(id: MidiEventId, tick: number): boolean {
    const event = this.getEventById(id);
    return event ? this.moveEvent(event, tick) : false;
  }

  public addTempoEvent(tick: number, bpm: number): TempoEvent {
    if (!Number.isInteger(tick) || tick < 0) {
      throw new RangeError("tick must be a non-negative integer");
    }
    const microsecondsPerQuarterNote = Math.round(60000000 / bpm);
    const data = new Uint8Array(3);
    data[0] = (microsecondsPerQuarterNote >> 16) & 0xff;
    data[1] = (microsecondsPerQuarterNote >> 8) & 0xff;
    data[2] = microsecondsPerQuarterNote & 0xff;
    const event: TempoEvent = {
      tick,
      deltaTime: 0,
      status: 0xff,
      type: MetaType.Tempo,
      length: data.length,
      microsecondsPerQuarterNote,
    };
    this.insertEventAt(tick, event);
    return event;
  }

  public getTempoEvents(): TempoEvent[] {
    return this.getTimedEventRecords()
      .filter(
        ({ event }) =>
          event.status === 0xff &&
          "type" in event &&
          event.type === MetaType.Tempo,
      )
      .map(
        ({ event, tick, order }) => ({ ...event, tick, order }) as TempoEvent,
      )
      .sort(sortEvents);
  }

  public addTimeSignatureEvent(
    tick: number,
    numerator: number = 4,
    denominator: number = 4,
  ): TimeSignatureEvent {
    if (!Number.isInteger(tick) || tick < 0) {
      throw new RangeError("tick must be a non-negative integer");
    }
    const event: TimeSignatureEvent = {
      tick,
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

  public getTimeSignatureEvents(): TimeSignatureEvent[] {
    return this.getTimedEventRecords()
      .filter(
        ({ event }) =>
          event.status === 0xff &&
          "type" in event &&
          event.type === MetaType.TimeSignature,
      )
      .map(
        ({ event, tick, order }) =>
          ({ ...event, tick, order }) as TimeSignatureEvent,
      )
      .sort(sortEvents);
  }

  public getTextEvents(): TextMidiEvent[] {
    const events: TextMidiEvent[] = [];
    for (const timed of this.getTimedEventRecords()) {
      const event = timed.event;
      if (
        event.status !== 0xff ||
        !("type" in event) ||
        !("text" in event) ||
        !TextMetaType[event.type]
      ) {
        continue;
      }
      events.push(this.createTextEvent(event, timed.tick, timed.order));
    }
    return events;
  }

  private createTextEvent(
    event: TextMidiEvent,
    tick: number,
    order?: number,
  ): TextMidiEvent {
    const textEvent: TextMidiEvent = {
      ...event,
      tick,
      order,
    };
    this.textEventSources.set(textEvent, event);
    return textEvent;
  }

  /** Creates a text-bearing meta event at an absolute tick. */
  public addTextEvent(
    type: TextMetaType,
    tick: number,
    text: string,
  ): TextMidiEvent {
    if (!Number.isInteger(tick) || tick < 0) {
      throw new RangeError("tick must be a non-negative integer");
    }
    if (!text.trim()) {
      throw new Error("Text events must contain text");
    }
    const event: TextMidiEvent = {
      tick,
      deltaTime: 0,
      status: 0xff,
      type,
      length: textByteLength(text),
      text: text,
    };
    this.insertEventAt(tick, event);
    const order = this.events.indexOf(event);
    if (order < 0) {
      throw new Error("Inserted text event is missing from its track");
    }
    return this.createTextEvent(event, tick, order);
  }

  public updateTextEvent(event: TextMidiEvent, text: string): boolean {
    const source = this.resolveEvent(event);
    if (!source || !("text" in source) || !text.trim()) return false;
    source.text = text;
    source.length = textByteLength(text);
    event.text = text;
    event.length = source.length;
    this.invalidateCaches();
    return true;
  }

  /** Moves any event while preserving absolute ordering and delta times. */
  public moveEvent(event: MidiEvent, tick: number): boolean {
    const source = this.resolveEvent(event);
    if (!source) return false;
    if (!Number.isInteger(tick) || tick < 0) {
      throw new RangeError("tick must be a non-negative integer");
    }
    const timedEvents = this.getTimedEventRecords();
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
    this.invalidateCaches();
    return true;
  }

  private resolveEvent(event: MidiEvent): MidiEvent | undefined {
    if (this.events.includes(event)) return event;
    if ("text" in event) {
      const source = this.textEventSources.get(event as TextMidiEvent);
      if (source && this.events.includes(source)) return source;
    }
    return undefined;
  }

  private isEndOfTrack(
    event: MidiEvent,
  ): event is MidiMetaEvent | TextMidiEvent {
    return (
      event.status === 0xff &&
      "type" in event &&
      event.type === MetaType.EndOfTrack
    );
  }

  private replaceTimedEvents(timedEvents: TimedEventRecord[]): void {
    let previousTick = 0;

    for (const timedEvent of timedEvents) {
      if (timedEvent.tick < previousTick) {
        throw new Error("MIDI events must be ordered by absolute tick");
      }

      timedEvent.event.deltaTime = timedEvent.tick - previousTick;

      previousTick = timedEvent.tick;
    }

    this.events.splice(
      0,
      this.events.length,
      ...timedEvents.map(({ event }) => event),
    );
    for (const event of this.events) {
      const id = this.eventIds.get(event);
      if (id) this.eventsById.set(id, event);
    }

    this.invalidateCaches();
  }

  private invalidateCaches(): void {
    this.noteCache = null;
    this.noteCacheByPitch = null;
    this.noteCacheByEventId = null;
    this.noteRevision += 1;
  }

  private removeEventId(event: MidiEvent): void {
    const id = this.eventIds.get(event);
    if (id) this.eventsById.delete(id);
  }

  public getNoteRevision(): number {
    return this.noteRevision;
  }

  private keepEndOfTrackLast(events: TimedEventRecord[]): TimedEventRecord[] {
    const finalTick = events
      .filter(({ event }) => !this.isEndOfTrack(event))
      .reduce((maximum, item) => Math.max(maximum, item.tick), 0);
    for (const item of events) {
      if (this.isEndOfTrack(item.event)) {
        item.tick = Math.max(item.tick, finalTick);
        item.order = Number.MAX_SAFE_INTEGER;
      }
    }
    return events.sort(sortEvents);
  }

  public getAbsoluteTickAt(eventIndex: number): number {
    if (
      !Number.isInteger(eventIndex) ||
      eventIndex < 0 ||
      eventIndex > this.events.length
    ) {
      throw new RangeError("eventIndex is outside the MIDI track");
    }

    let tick = 0;

    for (let index = 0; index < eventIndex; index++) {
      tick += this.events.at(index)?.deltaTime || 0;
    }

    return tick;
  }

  public getInsertionIndexAt(absoluteTick: number): number {
    if (!Number.isInteger(absoluteTick) || absoluteTick < 0) {
      throw new RangeError("absoluteTick must be a non-negative integer");
    }

    let tick = 0;
    const endOfTrackIndex = this.events.findIndex((event) =>
      this.isEndOfTrack(event),
    );

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
    const timedEvents = this.getTimedEventRecords();
    const firstNewOrder = timedEvents.length;

    entries.forEach(({ tick, event }, index) => {
      if (!Number.isInteger(tick) || tick < 0) {
        throw new RangeError("tick must be a non-negative integer");
      }

      timedEvents.push({ event, tick, order: firstNewOrder + index });
    });

    const finalTick = timedEvents
      .filter(({ event }) => !this.isEndOfTrack(event))
      .reduce((maximum, timedEvent) => Math.max(maximum, timedEvent.tick), 0);

    for (const timedEvent of timedEvents) {
      if (this.isEndOfTrack(timedEvent.event)) {
        timedEvent.tick = Math.max(timedEvent.tick, finalTick);
        timedEvent.order = Number.MAX_SAFE_INTEGER;
      }
    }

    timedEvents.sort(sortEvents);

    this.replaceTimedEvents(timedEvents);
  }

  public addNote(
    note: number,
    startDelta: number,
    velocity: number = 100,
    endDelta: number = 240,
    insertAt: number = this.events.length,
  ): {
    noteOn: MidiChannelEvent;
    noteOff: MidiChannelEvent;
  } {
    if (!Number.isInteger(note) || note < 0 || note > 127) {
      throw new RangeError("MIDI note must be between 0 and 127");
    }

    if (!Number.isInteger(startDelta) || startDelta < 0) {
      throw new RangeError("startDelta must be a non-negative integer");
    }

    if (!Number.isInteger(endDelta) || endDelta < 0) {
      throw new RangeError("endDelta must be a non-negative integer");
    }

    if (!Number.isInteger(velocity) || velocity < 1 || velocity > 127) {
      throw new RangeError("NoteOn velocity must be between 1 and 127");
    }

    if (
      !Number.isInteger(insertAt) ||
      insertAt < 0 ||
      insertAt > this.events.length
    ) {
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
      data1: note,
      data2: velocity,
    };

    const noteOff: MidiChannelEvent = {
      deltaTime: 0,
      status: 0x80 | channel,
      channel,
      messageType: ChannelMessage.NoteOff,
      data1: note,
      data2: 0,
    };

    this.insertEventsAt([
      { tick: startTick, event: noteOn },
      { tick: endTick, event: noteOff },
    ]);

    return { noteOn, noteOff };
  }

  /** Inserts a note at an absolute tick and returns its MIDI events. */
  public addNoteAt(
    tick: number,
    pitch: number,
    velocity: number = 100,
    duration: number = 240,
  ): { noteOn: MidiChannelEvent; noteOff: MidiChannelEvent } {
    if (!Number.isInteger(tick) || tick < 0) {
      throw new RangeError("tick must be a non-negative integer");
    }
    if (!Number.isInteger(duration) || duration < 1) {
      throw new RangeError("duration must be a positive integer");
    }

    const insertAt = this.getInsertionIndexAt(tick);
    return this.addNote(
      pitch,
      tick - this.getAbsoluteTickAt(insertAt),
      velocity,
      duration,
      insertAt,
    );
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

    const remaining = this.getTimedEventRecords().filter(
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
    if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
      throw new RangeError("MIDI note must be between 0 and 127");
    }
    return this.updateNote(note, { note: pitch });
  }

  /** Atomically updates note properties and rebuilds timed events once. */
  public updateNote(
    note: MidiNote,
    patch: Partial<Pick<MidiNote, "note" | "velocity" | "start" | "end">>,
  ): boolean {
    const currentNote = this.getNoteByEventId(this.getEventId(note.noteOn));
    if (!currentNote || !this.events.includes(currentNote.noteOff)) {
      return false;
    }

    const pitch = patch.note ?? currentNote.note;
    const velocity = patch.velocity ?? currentNote.velocity;
    const start = patch.start ?? currentNote.start;
    const end = patch.end ?? currentNote.end;
    if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
      throw new RangeError("MIDI note must be between 0 and 127");
    }
    if (!Number.isInteger(velocity) || velocity < 1 || velocity > 127) {
      throw new RangeError("NoteOn velocity must be between 1 and 127");
    }
    if (!Number.isInteger(start) || start < 0) {
      throw new RangeError("startTick must be a non-negative integer");
    }
    if (!Number.isInteger(end) || end <= start) {
      throw new RangeError("endTick must be greater than startTick");
    }

    const timedEvents = this.getTimedEventRecords();
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
    currentNote.velocity = velocity;
    currentNote.start = start;
    currentNote.end = end;
    if (note !== currentNote) {
      note.note = pitch;
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
    if (!Number.isInteger(durationTicks) || durationTicks < 1) {
      throw new RangeError("durationTicks must be a positive integer");
    }
    const currentNote = this.getNoteByEventId(this.getEventId(note.noteOn));
    return currentNote
      ? this.updateNote(note, { end: currentNote.start + durationTicks })
      : false;
  }

  /**
   * Moves a note to `startTick`, shifting its NoteOn/NoteOff by the same
   * delta so duration is preserved, then re-sorting and invalidating the
   * note cache.
   */
  public setNoteStart(note: MidiNote, startTick: number): boolean {
    if (!Number.isInteger(startTick) || startTick < 0) {
      throw new RangeError("startTick must be a non-negative integer");
    }
    const currentNote = this.getNoteByEventId(this.getEventId(note.noteOn));
    if (!currentNote) return false;
    const duration = currentNote.end - currentNote.start;
    return this.updateNote(note, {
      start: startTick,
      end: startTick + duration,
    });
  }

  public removeEvent(event: MidiEvent): boolean {
    const source = this.resolveEvent(event);
    if (!source) return false;

    this.removeEventId(source);
    const remaining = this.getTimedEventRecords().filter(
      (timedEvent) => timedEvent.event !== source,
    );

    this.replaceTimedEvents(remaining);
    return true;
  }

  public removeEventById(id: MidiEventId): boolean {
    const event = this.getEventById(id);
    return event ? this.removeEvent(event) : false;
  }

  private buildNoteCache(): void {
    interface PendingNote {
      pitch: number;
      velocity: number;
      startTick: number;
      noteOn: MidiChannelEvent;
    }

    const isChannelEvent = (event: MidiEvent): event is MidiChannelEvent =>
      event.status < 0xff;

    let currentTick = 0;
    const activeNotes = new Map<number, PendingNote[]>();
    const notes: MidiNote[] = [];
    let previousNote: MidiNote | undefined;

    for (const event of this.events) {
      currentTick += event.deltaTime;

      if (
        !isChannelEvent(event) ||
        ![ChannelMessage.NoteOn, ChannelMessage.NoteOff].includes(
          event.messageType,
        )
      ) {
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
          startTick: currentTick,
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
          note: pending.pitch,
          velocity: pending.velocity,
          start: pending.startTick,
          end: currentTick,
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

    const notesByPitch = new Map<number, MidiNote[]>();
    const notesByEventId = new Map<MidiEventId, MidiNote>();
    for (const note of notes) {
      const group = notesByPitch.get(note.note) ?? [];
      group.push(note);
      notesByPitch.set(note.note, group);
      notesByEventId.set(this.getEventId(note.noteOn), note);
    }

    this.noteCache = notes;
    this.noteCacheByPitch = notesByPitch;
    this.noteCacheByEventId = notesByEventId;
  }

  public getNotes(options: GetNotesOptions = {}): MidiNote[] {
    if (this.noteCache === null || this.noteCacheByPitch === null) {
      this.buildNoteCache();
    }

    if (options.pitch) {
      const { low, high } = options.pitch;
      const rangeNotes: MidiNote[] = [];

      for (const [pitch, notesForPitch] of this.noteCacheByPitch!) {
        if (pitch >= low && pitch < high) {
          rangeNotes.push(...notesForPitch);
        }
      }

      rangeNotes.sort((a, b) => a.start - b.start);
      return rangeNotes;
    }

    return this.noteCache!;
  }

  public toBuffer(): Uint8Array {
    const endOfTrackIndices = this.events
      .map((event, index) => (this.isEndOfTrack(event) ? index : -1))
      .filter((index) => index >= 0);

    if (
      endOfTrackIndices.length > 1 ||
      (endOfTrackIndices.length === 1 &&
        endOfTrackIndices[0] !== this.events.length - 1)
    ) {
      throw new Error("EndOfTrack must be the final event in a MIDI track");
    }

    const eventBytes = this.events.map(encodeMidiEvent);

    if (endOfTrackIndices.length === 0) {
      eventBytes.push(new Uint8Array([0x00, 0xff, 0x2f, 0x00]));
    }

    const body = concatBytes(eventBytes);
    const chunk = new Uint8Array(8);

    writeAscii(chunk, 0, "MTrk");
    writeUInt32BE(chunk, 4, body.length);

    return concatBytes([chunk, body]);
  }
}
