// https://midimusic.github.io/tech/midispec.html

import { Parser } from "binary-parser/dist/binary_parser.js";
import {
  ChannelMessage,
  MetaType,
  MidiChannelEvent,
  MidiEvent,
  MidiFormat,
  MidiMetaEvent,
  MidiSysExEvent,
  TempoChange,
  TempoMetaPayload,
  TextMetaPayload,
  TimedMidiEvent,
  TimeSignatureChange,
  TimeSignatureMetaPayload,
} from "./types.js";
import {
  concatBytes,
  encodeMidiEvent,
  writeAscii,
  writeUInt16BE,
  writeUInt32BE,
} from "./util.js";
import { headerParser, trackParser } from "./parsers.js";
import * as ini from "ini";

interface MidiNote {
  note: number;
  velocity: number;
  start: number;
  end: number;
  noteOn: MidiChannelEvent;
  noteOff: MidiChannelEvent;
  previous?: MidiNote;
}

class MidiHeader {
  format: MidiFormat = 1;
  trackCount: number = 0;
  division: number = 480;
  isSMPTE: boolean = false;
}

export interface GetNotesOptions {
  pitch?: {
    low: number;
    high: number;
  };
}

export function getMidiEventType(
  status: number,
): "channel" | "meta" | "sysex" | "unknown" {
  if (status < 0xff) {
    return "channel";
  } else if (status === 0xff) {
    return "meta";
  } else if (status === 0xf0 || status === 0xf7) {
    return "sysex";
  }
  return "unknown";
}

export function getMidiEventProps(status: number): string[] {
  const common = ["deltaTime", "status"];
  if (status < 0xff) {
    return common.concat("channel", "messageType", "data1", "data2");
  } else if (status === 0xff) {
    return common.concat("type", "length", "data");
  } else if (status === 0xf0 || status === 0xf7) {
    return common.concat("length", "data");
  }
  return common;
}

class MidiTrack {
  format: MidiFormat = 0;
  name: string = "";
  events: MidiEvent[] = [];

  private noteCache: MidiNote[] | null = null;
  private noteCacheByPitch: Map<number, MidiNote[]> | null = null;

  public constructor(name: string = "") {
    this.name = name;
  }

  public getChannelEvents(): MidiChannelEvent[] {
    return this.events.filter(
      (event) => event.status < 0xff,
    ) as MidiChannelEvent[];
  }

  public getMetaEvents(): MidiMetaEvent[] {
    return this.events.filter(
      (event) => event.status === 0xff,
    ) as MidiMetaEvent[];
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
    let tick = 0;

    return this.events.map((event, order) => {
      tick += event.deltaTime;
      return {
        event,
        tick,
        order,
      };
    });
  }

  private isEndOfTrack(event: MidiEvent): event is MidiMetaEvent {
    return (
      event.status === 0xff &&
      "type" in event &&
      event.type === MetaType.EndOfTrack
    );
  }

  private replaceTimedEvents(timedEvents: TimedMidiEvent[]): void {
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

    this.noteCache = null;
    this.noteCacheByPitch = null;
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
   * and single meta-event insertion (tempo/time-signature changes).
   */
  public insertEventsAt(entries: { tick: number; event: MidiEvent }[]): void {
    const timedEvents = this.getTimedEvents();
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

    timedEvents.sort((a, b) => a.tick - b.tick || a.order - b.order);

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

    const remaining = this.getTimedEvents().filter(
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

    if (
      this.events.indexOf(note.noteOn) < 0 ||
      this.events.indexOf(note.noteOff) < 0
    ) {
      return false;
    }

    note.noteOn.data1 = pitch;
    note.noteOff.data1 = pitch;
    note.note = pitch;

    this.noteCache = null;
    this.noteCacheByPitch = null;

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

    if (
      this.events.indexOf(note.noteOn) < 0 ||
      this.events.indexOf(note.noteOff) < 0
    ) {
      return false;
    }

    const timedEvents = this.getTimedEvents();
    const noteOnTimed = timedEvents.find(
      (timedEvent) => timedEvent.event === note.noteOn,
    );
    const noteOffTimed = timedEvents.find(
      (timedEvent) => timedEvent.event === note.noteOff,
    );

    if (!noteOnTimed || !noteOffTimed) {
      return false;
    }

    const newEndTick = noteOnTimed.tick + durationTicks;

    const others = timedEvents.filter(
      (timedEvent) => timedEvent.event !== note.noteOff,
    );
    others.push({
      event: note.noteOff,
      tick: newEndTick,
      order: noteOffTimed.order,
    });

    const finalTick = others
      .filter(({ event }) => !this.isEndOfTrack(event))
      .reduce((maximum, timedEvent) => Math.max(maximum, timedEvent.tick), 0);

    for (const timedEvent of others) {
      if (this.isEndOfTrack(timedEvent.event)) {
        timedEvent.tick = Math.max(timedEvent.tick, finalTick);
      }
    }

    others.sort((a, b) => a.tick - b.tick || a.order - b.order);

    this.replaceTimedEvents(others);

    note.end = newEndTick;

    this.noteCache = null;
    this.noteCacheByPitch = null;

    return true;
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

    if (
      this.events.indexOf(note.noteOn) < 0 ||
      this.events.indexOf(note.noteOff) < 0
    ) {
      return false;
    }

    const timedEvents = this.getTimedEvents();
    const noteOnTimed = timedEvents.find(
      (timedEvent) => timedEvent.event === note.noteOn,
    );
    const noteOffTimed = timedEvents.find(
      (timedEvent) => timedEvent.event === note.noteOff,
    );

    if (!noteOnTimed || !noteOffTimed) {
      return false;
    }

    const duration = noteOffTimed.tick - noteOnTimed.tick;
    const newEndTick = startTick + duration;

    const others = timedEvents.filter(
      (timedEvent) =>
        timedEvent.event !== note.noteOn && timedEvent.event !== note.noteOff,
    );
    others.push({
      event: note.noteOn,
      tick: startTick,
      order: noteOnTimed.order,
    });
    others.push({
      event: note.noteOff,
      tick: newEndTick,
      order: noteOffTimed.order,
    });

    const finalTick = others
      .filter(({ event }) => !this.isEndOfTrack(event))
      .reduce((maximum, timedEvent) => Math.max(maximum, timedEvent.tick), 0);

    for (const timedEvent of others) {
      if (this.isEndOfTrack(timedEvent.event)) {
        timedEvent.tick = Math.max(timedEvent.tick, finalTick);
      }
    }

    others.sort((a, b) => a.tick - b.tick || a.order - b.order);

    this.replaceTimedEvents(others);

    note.start = startTick;
    note.end = newEndTick;

    this.noteCache = null;
    this.noteCacheByPitch = null;

    return true;
  }

  public removeEvent(event: MidiEvent): boolean {
    if (this.events.indexOf(event) < 0) {
      return false;
    }

    const remaining = this.getTimedEvents().filter(
      (timedEvent) => timedEvent.event !== event,
    );

    this.replaceTimedEvents(remaining);
    return true;
  }

  private buildNoteCache(): void {
    interface PendingNote {
      pitch: number;
      velocity: number;
      startTick: number;
      noteOn: MidiChannelEvent;
    }

    let currentTick = 0;
    const activeNotes = new Map<number, PendingNote[]>();
    const notes: MidiNote[] = [];
    let previousNote: MidiNote | undefined;

    const noteEvents = this.getNoteEvents();
    for (const event of noteEvents) {
      currentTick += event.deltaTime;

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
    for (const note of notes) {
      const group = notesByPitch.get(note.note) ?? [];
      group.push(note);
      notesByPitch.set(note.note, group);
    }

    this.noteCache = notes;
    this.noteCacheByPitch = notesByPitch;
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

class Midi {
  header: MidiHeader;
  tracks: MidiTrack[];

  public get trackCount(): number {
    return this.tracks.length;
  }

  constructor(data: Uint8Array | undefined = undefined) {
    this.header = new MidiHeader();
    this.tracks = [];

    if (data) {
      this.parse(data);
    }
  }

  private parse(data: Uint8Array): void {
    const midiParser = new Parser()
      .useContextVars()
      .nest("header", {
        type: headerParser,
      })
      .array("tracks", {
        type: trackParser,
        length: function (this: any) {
          return this.header.trackCount;
        },
      });

    const result = midiParser.parse(data);

    this.header.format = result.header.format;
    this.header.trackCount = result.header.trackCount;
    this.header.division = result.header.ppqn;
    this.header.isSMPTE = Boolean(result.header.isSMPTE);

    this.tracks = result.tracks.map((parsedTrack: any) => {
      const track = new MidiTrack();

      track.format = result.header.format;
      track.events = parsedTrack.events as MidiEvent[];

      const trackNameEvent = track
        .getMetaEvents()
        .find((event) => event.type === MetaType.TrackName);

      if (trackNameEvent) {
        track.name = (trackNameEvent.data as TextMetaPayload).text;
      }

      return track;
    });
  }

  public getTrack(name: string): MidiTrack | undefined {
    return this.tracks.find((track) => track.name === name);
  }

  public addTrack(): number {
    const index = this.tracks.length;
    const track = new MidiTrack(`Track ${index}`);
    this.tracks.push(track);
    return index;
  }

  public removeTrack(index: number): number {
    this.tracks.splice(index, 1);
    return this.tracks.length;
  }

  public getTempoChanges(): TempoChange[] {
    const changes = (this.tracks[0]?.getTimedEvents() ?? [])
      .filter(
        (timedEvent): timedEvent is TimedMidiEvent & { event: MidiMetaEvent } =>
          timedEvent.event.status === 0xff &&
          (timedEvent.event as MidiMetaEvent).type === MetaType.Tempo,
      )
      .map((timedEvent) => ({
        tick: timedEvent.tick,
        microsecondsPerQuarterNote: (timedEvent.event.data as TempoMetaPayload)
          .microsecondsPerQuarterNote,
      }))
      .sort((a, b) => a.tick - b.tick);

    if (changes.length === 0 || changes[0].tick !== 0) {
      changes.unshift({ tick: 0, microsecondsPerQuarterNote: 500_000 });
    }

    return changes;
  }

  public getTimeSignatureChanges(): TimeSignatureChange[] {
    const changes = (this.tracks[0]?.getTimedEvents() ?? [])
      .filter(
        (timedEvent): timedEvent is TimedMidiEvent & { event: MidiMetaEvent } =>
          timedEvent.event.status === 0xff &&
          (timedEvent.event as MidiMetaEvent).type === MetaType.TimeSignature,
      )
      .map((timedEvent) => {
        const payload = timedEvent.event.data as TimeSignatureMetaPayload;
        return {
          tick: timedEvent.tick,
          numerator: payload.numerator,
          denominator: payload.denominator,
        };
      })
      .sort((a, b) => a.tick - b.tick);

    if (changes.length === 0 || changes[0].tick !== 0) {
      // Denominator is stored as a power-of-two exponent (2 == quarter note), per the MIDI spec.
      changes.unshift({ tick: 0, numerator: 4, denominator: 2 });
    }

    return changes;
  }

  public addTempoChange(
    tick: number,
    microsecondsPerQuarterNote: number,
  ): void {
    const track = this.tracks[0];

    if (!track) {
      throw new Error("Midi file has no tracks");
    }

    const event: MidiMetaEvent = {
      deltaTime: 0,
      status: 0xff,
      type: MetaType.Tempo,
      length: 3,
      data: { microsecondsPerQuarterNote } as TempoMetaPayload,
    };

    track.insertEventsAt([{ tick, event }]);
  }

  public removeTempoChangeAt(tick: number): boolean {
    const track = this.tracks[0];

    if (!track) {
      return false;
    }

    const match = track
      .getTimedEvents()
      .find(
        (timedEvent) =>
          timedEvent.tick === tick &&
          timedEvent.event.status === 0xff &&
          (timedEvent.event as MidiMetaEvent).type === MetaType.Tempo,
      );

    return match ? track.removeEvent(match.event) : false;
  }

  public addTimeSignatureChange(
    tick: number,
    numerator: number,
    denominator: number,
  ): void {
    const track = this.tracks[0];

    if (!track) {
      throw new Error("Midi file has no tracks");
    }

    const event: MidiMetaEvent = {
      deltaTime: 0,
      status: 0xff,
      type: MetaType.TimeSignature,
      length: 4,
      data: {
        numerator,
        denominator,
        // Standard defaults: 24 clocks per metronome click, 8 32nd-notes per quarter.
        clocksPerClick: 24,
        thirtySecondNotesPerQuarter: 8,
      } as TimeSignatureMetaPayload,
    };

    track.insertEventsAt([{ tick, event }]);
  }

  public removeTimeSignatureChangeAt(tick: number): boolean {
    const track = this.tracks[0];

    if (!track) {
      return false;
    }

    const match = track
      .getTimedEvents()
      .find(
        (timedEvent) =>
          timedEvent.tick === tick &&
          timedEvent.event.status === 0xff &&
          (timedEvent.event as MidiMetaEvent).type === MetaType.TimeSignature,
      );

    return match ? track.removeEvent(match.event) : false;
  }

  private checkWriteable() {
    if (
      !Number.isInteger(this.header.format) ||
      this.header.format < 0 ||
      this.header.format > 2
    ) {
      throw new RangeError("MIDI format must be 0, 1, or 2");
    }

    if (this.header.format === MidiFormat.Single && this.trackCount !== 1) {
      throw new Error("Format 0 MIDI files must contain exactly one track");
    }

    if (this.trackCount === 0) {
      throw new Error("A MIDI file must contain at least one track");
    }

    if (
      !Number.isInteger(this.header.division) ||
      this.header.division < 0 ||
      this.header.division > 0x7fff
    ) {
      throw new RangeError("MIDI division must fit in the lower 15 bits");
    }
  }

  public toBuffer(): Uint8Array {
    this.checkWriteable();

    const division = this.header.isSMPTE
      ? 0x8000 | this.header.division
      : this.header.division;

    const header = new Uint8Array(14);
    writeAscii(header, 0, "MThd");
    writeUInt32BE(header, 4, 6);
    writeUInt16BE(header, 8, this.header.format);
    writeUInt16BE(header, 10, this.trackCount);
    writeUInt16BE(header, 12, division);

    this.header.trackCount = this.trackCount;

    return concatBytes([
      header,
      ...this.tracks.map((track) => track.toBuffer()),
    ]);
  }

  public toIni(): string {
    this.checkWriteable();

    const headerString = ini.stringify(this.header, { section: "header" });

    const dump = (e: any): string => {
      return Object.values(e)
        .map((o: any): string => {
          switch (typeof o) {
            case "string":
              return `"${o}"`;
            case "object":
              return dump(o);
          }
          return String(o);
        })
        .join(" ");
    };

    const tracks = this.tracks.map((track) => {
      return {
        name: track.name,
        e: track.events.map((e) => dump(e)),
      };
    });
    const tracksString = ini.stringify(tracks, { section: "tracks" });

    return [headerString, tracksString].join("\n");
  }

  public static fromIni(content: string): Midi {
    const obj = ini.parse(content);

    const iniHeader = obj.header;
    (Object.entries(iniHeader) as string[][]).forEach(([key, value]): void => {
      if (value === "true" || value === "false") {
        iniHeader[key] = value === "true";
        return;
      }
      try {
        iniHeader[key] = Number(value);
      } catch {
        return;
      }
    });
    const midi = new Midi();
    midi.header = new MidiHeader();
    Object.assign(midi.header, iniHeader);

    const iniTracks: { name: string; e: string[] }[] = obj.tracks;
    console.log(iniTracks);
    Object.values(iniTracks).map((o) => {
      const track = new MidiTrack();
      track.name = o.name;
      if (o.e === undefined) {
        return [];
      }
      track.events = o.e.map((e) => {
        const rawValues = e.split(" ").map((v) => {
          try {
            return Number(v);
          } catch {
            return v;
          }
        });
        const props = getMidiEventProps(rawValues[0] as number);
        console.log(props);
        // const event = Object.fromEntries(
        //   e.split(" ").map((v, i) => [`prop${i}`, v]),
        // );
        // switch (getMidiEventType(event.status)) {
        //   default:
        //     break;
        // }

        return {} as MidiEvent;
      });

      midi.tracks.push(track);
    });

    return new Midi();
  }
}

export {
  Midi,
  MidiFormat,
  MidiHeader,
  MidiTrack,
  MidiNote,
  TempoChange,
  TimeSignatureChange,
};
