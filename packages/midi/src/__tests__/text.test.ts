import { describe, expect, test } from "vitest";
import { Midi } from "../midi.js";
import { MetaType, type TextMidiEvent } from "../types.js";
import {
  decodeMetaPayload,
  decodeText,
  encodeMetaPayload,
  encodeText,
  textByteLength,
} from "../codec.js";
import { MidiTrack } from "../track.js";

const SAMPLES = ["plain", "café", "é", "日本語の歌", "🎤 sing", "naïve+"];

function lyricMidi(texts: readonly string[]): Midi {
  const midi = new Midi();
  const track = new MidiTrack("VOCALS");
  midi.tracks = [track];
  midi.header.trackCount = 1;
  texts.forEach((text, index) => {
    track.addTextEvent(MetaType.Lyric, index * 480, text);
  });
  return midi;
}

function lyricTexts(midi: Midi): string[] {
  return midi.tracks[0]
    .getTextEvents()
    .filter((event) => event.type === MetaType.Lyric)
    .map(({ text }) => text);
}

describe("text meta encoding", () => {
  test("encodes text payloads as UTF-8 and counts bytes", () => {
    expect([...encodeText("é")]).toEqual([0xc3, 0xa9]);
    expect(textByteLength("é")).toBe(2);
    expect(textByteLength("🎤")).toBe(4);
    expect(textByteLength("abc")).toBe(3);
  });

  test("keeps ASCII payloads byte-for-byte identical", () => {
    const bytes = encodeMetaPayload(MetaType.Marker, { text: "[section]" });
    expect(String.fromCharCode(...bytes)).toBe("[section]");
  });

  test("decodes UTF-8 and falls back to Latin-1 for legacy bytes", () => {
    expect(decodeText(encodeText("日本語"))).toBe("日本語");
    // 0xe9 alone is invalid UTF-8; Latin-1 reads it as "é".
    expect(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe("café");
    expect(
      decodeMetaPayload(MetaType.Lyric, new Uint8Array([0x6e, 0xe9])),
    ).toEqual({ text: "né" });
  });

  test("addTextEvent and updateTextEvent store the encoded byte length", () => {
    const track = new MidiTrack("VOCALS");
    const event = track.addTextEvent(MetaType.Lyric, 0, "é");
    expect(event.length).toBe(2);
    expect(track.updateTextEvent(event as TextMidiEvent, "日本")).toBe(true);
    expect(event.length).toBe(6);
  });

  test("getTextEvents exposes editable text events without a wrapper", () => {
    const track = new MidiTrack("VOCALS");
    track.addTextEvent(MetaType.Lyric, 0, "first");

    const [event] = track.getTextEvents();
    expect(event).toMatchObject({
      tick: 0,
      type: MetaType.Lyric,
      text: "first",
      order: 0,
    });
    expect("event" in event).toBe(false);

    expect(track.updateTextEvent(event, "updated")).toBe(true);
    expect(track.getTextEvents()[0].text).toBe("updated");

    const updated = track.getTextEvents()[0];
    expect(track.moveEvent(updated, 480)).toBe(true);
    expect(track.getTextEvents()[0].tick).toBe(480);
    expect(track.removeEvent(track.getTextEvents()[0])).toBe(true);
    expect(track.getTextEvents()).toEqual([]);
  });
});

describe("text meta round trips", () => {
  test("round-trips UTF-8 lyrics through a .mid buffer", () => {
    const midi = lyricMidi(SAMPLES);
    const restored = new Midi(midi.toBuffer());
    expect(lyricTexts(restored)).toEqual(SAMPLES);
    const lengths = restored.tracks[0]
      .getTextEvents()
      .map((event) => event.length);
    expect(lengths).toEqual(SAMPLES.map(textByteLength));
  });

  test("round-trips UTF-8 lyrics through .ini", () => {
    const midi = lyricMidi(SAMPLES);
    const restored = Midi.fromIni(midi.toIni());
    expect(lyricTexts(restored)).toEqual(SAMPLES);
  });

  test("round-trips UTF-8 track names", () => {
    const midi = new Midi();
    const track = new MidiTrack("Chœur");
    track.addTextEvent(MetaType.TrackName, 0, "Chœur");
    midi.tracks = [track];
    const restored = new Midi(midi.toBuffer());
    expect(restored.tracks[0].name).toBe("Chœur");
  });
});
