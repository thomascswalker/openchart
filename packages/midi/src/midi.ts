// https://midimusic.github.io/tech/midispec.html

import {
  ChannelMessage,
  MetaType,
  MidiChannelEvent,
  MidiEvent,
  MidiFormat,
  MidiMetaEvent,
  MidiSysExEvent,
  TempoEvent,
  TimeSignatureEvent,
  TextMidiEvent,
  TextMetaType,
  extractMetaPayload,
} from "./types";
import { isTwoByteMessage } from "./util";
import {
  concatBytes,
  decodeMetaPayload,
  encodeMetaPayload,
  writeAscii,
  writeUInt16BE,
  writeUInt32BE,
  encodeBase64,
  decodeBase64,
  parseInteger,
} from "./codec";
import { trackParser } from "./parsers";
import * as ini from "ini";
import { MidiTrack } from "./track";

class MidiHeader {
  format: MidiFormat = 1;
  trackCount: number = 0;
  division: number = 480;
  isSMPTE: boolean = false;
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

  public clone(): Midi {
    const midi = new Midi();
    midi.header = { ...this.header };
    midi.tracks = this.tracks.map((track) => track.clone());
    return midi;
  }

  private parse(data: Uint8Array): void {
    // Ensure at least the main file header exists
    if (data.length < 14) {
      throw new Error("MIDI file is truncated");
    }

    // Data reader
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    // Validate file header
    const magic = String.fromCharCode(...data.subarray(0, 4));
    const headerLength = view.getUint32(4);
    if (magic !== "MThd" || headerLength !== 6) {
      throw new Error("Invalid MIDI header chunk");
    }
    this.header.format = view.getUint16(8) as MidiFormat;
    const declaredTrackCount = view.getUint16(10);
    const division = view.getUint16(12);
    this.header.division = division & 0x7fff;
    this.header.isSMPTE = (division & 0x8000) !== 0;

    // Parse tracks
    const parsedTracks: any[] = [];
    let offset = 14;
    while (offset < data.length) {
      if (data.length - offset < 8) {
        throw new Error("MIDI track chunk header is truncated");
      }
      const trackMagic = String.fromCharCode(
        ...data.subarray(offset, offset + 4),
      );
      const length = view.getUint32(offset + 4);
      const chunkEnd = offset + 8 + length;
      if (trackMagic !== "MTrk") {
        throw new Error(`Invalid MIDI track chunk '${trackMagic}'`);
      }
      if (chunkEnd > data.length) {
        throw new Error("MIDI track chunk is truncated");
      }
      parsedTracks.push(trackParser.parse(data.subarray(offset, chunkEnd)));
      offset = chunkEnd;
    }

    if (parsedTracks.length === 0 && declaredTrackCount > 0) {
      throw new Error("MIDI header declares tracks but contains none");
    }
    // The actual chunks are authoritative for the in-memory document. This
    // also makes a later write repair stale header track-count metadata.
    this.header.trackCount = parsedTracks.length;

    this.tracks = parsedTracks.map((parsedTrack: any) => {
      const track = new MidiTrack();

      track.format = this.header.format;
      track.events = (parsedTrack.events as MidiEvent[]).map((event) => {
        if (event.status === 0xff && "data" in event) {
          const metaEvent = event as MidiMetaEvent & {
            data: Record<string, unknown> | Uint8Array;
          };
          const { data, ...base } = metaEvent;
          const payload = data instanceof Uint8Array ? { bytes: data } : data;
          return Object.assign({}, base, payload) as MidiMetaEvent;
        }
        return event;
      });

      const trackNameEvent = track
        .getTextEvents()
        .find((event) => event.type === MetaType.TrackName);

      if (trackNameEvent) {
        track.name = trackNameEvent.text;
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
    this.header.trackCount = this.tracks.length;
    return index;
  }

  public removeTrack(index: number): number {
    this.tracks.splice(index, 1);
    this.header.trackCount = this.tracks.length;
    return this.tracks.length;
  }

  public getTempoEvents(): TempoEvent[] {
    return this.tracks.map((track) => track.getTempoEvents()).flat();
  }

  public getTimeSignatureEvents(): TimeSignatureEvent[] {
    return this.tracks.map((track) => track.getTimeSignatureEvents()).flat();
  }

  public addTempoEvent(tick: number, microsecondsPerQuarterNote: number): void {
    const track = this.tracks[0];

    if (!track) {
      throw new Error("Midi file has no tracks");
    }

    const event: TempoEvent = {
      deltaTime: 0,
      tick,
      status: 0xff,
      type: MetaType.Tempo,
      length: 3,
      microsecondsPerQuarterNote,
    };

    track.insertEventsAt([event]);
  }

  public removeTempoEventAt(tick: number): boolean {
    const track = this.tracks[0];
    if (!track) return false;
    const match = track.getTempoEvents().find((event) => event.tick === tick);
    return match ? track.removeEvent(match) : false;
  }

  public addTimeSignatureEvent(
    tick: number,
    numerator: number,
    denominator: number,
  ): void {
    const track = this.tracks[0];

    if (!track) {
      throw new Error("Midi file has no tracks");
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

    track.insertEventsAt([event]);
  }

  public removeTimeSignatureEventAt(tick: number): boolean {
    const track = this.tracks[0];
    if (!track) return false;
    const match = track
      .getTimeSignatureEvents()
      .find((event) => event.tick === tick);
    return match ? track.removeEvent(match) : false;
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

    this.header.trackCount = this.trackCount;

    const headerString = ini.stringify(this.header, { section: "header" });

    const serializeEvent = (event: MidiEvent): string => {
      if (event.status === 0xff) {
        const metaEvent = event as MidiMetaEvent;
        const rawPayload = extractMetaPayload(metaEvent);
        const encodedPayload = encodeMetaPayload(metaEvent.type, rawPayload);
        return [
          event.deltaTime,
          event.status,
          metaEvent.type,
          encodeBase64(encodedPayload),
        ].join(" ");
      }

      if (event.status === 0xf0 || event.status === 0xf7) {
        return [
          event.deltaTime,
          event.status,
          encodeBase64((event as MidiSysExEvent).data),
        ].join(" ");
      }

      const channelEvent = event as MidiChannelEvent;
      const status =
        event.status >= 0x80 && event.status < 0xf0
          ? event.status
          : channelEvent.messageType | (channelEvent.channel & 0x0f);
      const values = [event.deltaTime, status, channelEvent.data1];

      if (isTwoByteMessage(status)) {
        values.push(channelEvent.data2 ?? 0);
      }

      return values.join(" ");
    };

    const tracks = this.tracks.map((track) => {
      return {
        name: track.name,
        e: track.events.map(serializeEvent),
      };
    });
    const tracksString = ini.stringify(tracks, { section: "tracks" });

    return [headerString, tracksString].join("\n");
  }

  public static fromIni(content: string): Midi {
    const obj = ini.parse(content) as {
      header?: Record<string, string>;
      tracks?: Record<string, { name?: string; e?: string | string[] }>;
    };
    const iniHeader = obj.header;

    if (!iniHeader) {
      throw new Error("INI MIDI data is missing a header section");
    }

    const midi = new Midi();
    midi.header = {
      format: parseInteger(
        iniHeader.format ?? "",
        "header format",
      ) as MidiFormat,
      trackCount: parseInteger(iniHeader.trackCount ?? "", "header trackCount"),
      division: parseInteger(iniHeader.division ?? "", "header division"),
      isSMPTE: iniHeader.isSMPTE === "true",
    };

    const parseEvent = (record: string): MidiEvent => {
      const values = record.trim().split(/\s+/);
      const deltaTime = parseInteger(values[0] ?? "", "event deltaTime");
      const status = parseInteger(values[1] ?? "", "event status");

      if (status >= 0x80 && status < 0xf0) {
        const messageType = status & 0xf0;
        const expectedLength = isTwoByteMessage(status) ? 4 : 3;

        if (values.length !== expectedLength) {
          throw new Error(
            `Channel event status ${status} has an invalid field count`,
          );
        }

        const channelEvent: MidiChannelEvent = {
          deltaTime,
          tick: 0,
          status,
          channel: status & 0x0f,
          messageType: messageType as ChannelMessage,
          data1: parseInteger(values[2], "channel event data1"),
        };

        if (isTwoByteMessage(status)) {
          channelEvent.data2 = parseInteger(values[3], "channel event data2");
        }

        return channelEvent;
      }

      if (status === 0xff) {
        if (values.length !== 4) {
          throw new Error("Meta event has an invalid field count");
        }

        const type = parseInteger(values[2], "meta event type");
        const bytes = decodeBase64(values[3]);
        const event: MidiMetaEvent = {
          deltaTime,
          tick: 0,
          status: 0xff,
          type: type as MetaType,
          length: bytes.length,
          ...decodeMetaPayload(type, bytes),
        };
        if (TextMetaType[type]) {
          const { text } = event as TextMidiEvent;
          return {
            deltaTime,
            tick: 0,
            status: 0xff,
            type: type as TextMetaType,
            length: bytes.length,
            text,
          };
        }
        return event;
      }

      if (status === 0xf0 || status === 0xf7) {
        if (values.length !== 3) {
          throw new Error("SysEx event has an invalid field count");
        }

        const data = decodeBase64(values[2]);
        // tick is recomputed from deltaTime by the MidiTrack.events setter
        return { deltaTime, tick: 0, status, length: data.length, data };
      }

      throw new Error(`Invalid MIDI event status: ${status}`);
    };

    for (const trackData of Object.values(obj.tracks ?? {})) {
      const track = new MidiTrack(trackData.name ?? "");
      const records = trackData.e === undefined ? [] : [trackData.e].flat();
      track.format = midi.header.format;
      track.events = records.map(parseEvent);
      midi.tracks.push(track);
    }

    if (midi.header.trackCount !== midi.trackCount) {
      throw new Error(
        "INI MIDI header trackCount does not match the track sections",
      );
    }

    return midi;
  }
}

export { Midi, MidiHeader };
