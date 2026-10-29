import path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { MetaType, Midi, MidiTrack } from "@openchart/midi";
import { describe, expect, it } from "vitest";
import {
  DefaultCompiledRuleset,
  EditingModeId,
  RuleEnforcer,
  createRulesetContext,
  createDefaultModeRegistry,
  VocalNoteKind,
  VocalPhraseKind,
} from "../../src/index.js";
import { SongView } from "../../src/views/song.js";
import { VocalTrackView } from "../../src/views/vocal.js";

const layout = VocalTrackView.layoutFromRules(
  DefaultCompiledRuleset.byKey.get("vocals")!,
);

/**
 * The view is read-only; these helpers stand in for the editing session by
 * writing through the low-level vocal helpers, then re-reading the view.
 */
function vocals(midi = new Midi()) {
  const view = () => new SongView(midi).getVocalTrackView("VOCALS")!;
  const track = () => {
    let t = midi.getTrack("VOCALS");
    if (!t) {
      t = new MidiTrack("VOCALS");
      midi.tracks.push(t);
    }
    return t;
  };
  return {
    midi,
    get view() {
      return view();
    },
    track,
    addPitched: (pitch: number, start: number, end: number, lyric?: string) => {
      track();
      return view().addNote(VocalNoteKind.Pitched, start, end, {
        pitch,
        lyric,
      });
    },
    addPitchless: (
      start: number,
      end: number,
      lyric?: string,
      pitch?: number,
    ) => {
      track();
      return view().addNote(VocalNoteKind.Pitchless, start, end, {
        lyric,
        pitch,
      });
    },
    addPercussion: (start: number, end: number) => {
      track();
      return view().addNote(VocalNoteKind.Percussion, start, end);
    },
    addPhrase: (kind: VocalPhraseKind, start: number, end: number) => {
      track();
      return view().addPhrase(kind, start, end);
    },
  };
}

function lyrics(view: VocalTrackView): Array<[number, string]> {
  return view.getLyrics().map(({ tick, text }) => [tick, text]);
}

describe("vocal rules", () => {
  it("builds a vocal view (not an instrument view) with no difficulties", () => {
    const song = new SongView(new Midi());
    const view = song.getVocalTrackView("VOCALS")!;
    expect(view).toBeInstanceOf(VocalTrackView);
    expect(song.getInstrumentTrackView("VOCALS")).toBeUndefined();

    const registry = createDefaultModeRegistry();
    const vocal = DefaultCompiledRuleset.byName.get("VOCALS")!;
    const lead = DefaultCompiledRuleset.byName.get("LEAD GUITAR")!;
    const descriptors = DefaultCompiledRuleset.descriptors();
    const d = (name: string) => descriptors.find((x) => x.name === name)!;
    expect(registry.resolve(d(vocal.name), "piano-roll")?.id).toBe(
      EditingModeId.MidiVocals,
    );
    expect(registry.resolve(d(vocal.name), "highway")).toBeNull();
    expect(registry.resolve(d(lead.name), "highway")?.id).toBe(
      EditingModeId.ChartLanes,
    );

    const l = view.getLayout();
    expect(l.range).toEqual({ low: 36, high: 84 });
    expect(l.pitchlessPlacement).toBe(85);
    expect(l).toMatchObject({
      vocalPhrase: 96,
      powerWindow: 111,
      power: 116,
      percussion: 90,
      pitchlessHigh: 85,
      pitchlessLow: 35,
    });
  });

  it("classifies pitched, pitchless, percussion and phrase pitches", () => {
    expect(VocalTrackView.classifyPitch(layout, 36)).toEqual({
      type: "note",
      kind: VocalNoteKind.Pitched,
    });
    expect(VocalTrackView.classifyPitch(layout, 84)).toEqual({
      type: "note",
      kind: VocalNoteKind.Pitched,
    });
    for (const pitch of [85, 35]) {
      expect(VocalTrackView.classifyPitch(layout, pitch)).toEqual({
        type: "note",
        kind: VocalNoteKind.Pitchless,
      });
    }
    expect(VocalTrackView.classifyPitch(layout, 90)).toEqual({
      type: "note",
      kind: VocalNoteKind.Percussion,
    });
    expect(VocalTrackView.classifyPitch(layout, 96)).toEqual({
      type: "phrase",
      kind: VocalPhraseKind.Vocal,
    });
    expect(VocalTrackView.classifyPitch(layout, 111)).toEqual({
      type: "phrase",
      kind: VocalPhraseKind.PowerWindow,
    });
    expect(VocalTrackView.classifyPitch(layout, 116)).toEqual({
      type: "phrase",
      kind: VocalPhraseKind.StagePower,
    });
    expect(VocalTrackView.classifyPitch(layout, 23)).toEqual({
      type: "unknown",
    });
  });
});

describe("VocalTrackView reading and validation", () => {
  it("reads notes and lyrics written on the same tick", () => {
    const v = vocals();
    const pitched = v.addPitched(60, 480, 720, "hel-")!;
    const pitchless = v.addPitchless(960, 1200, "lo")!;
    const low = v.addPitchless(1440, 1680, "oh", 35)!;
    const percussion = v.addPercussion(1920, 2040)!;

    expect(pitched.lyric?.tick).toBe(480);
    expect(pitchless.note.pitch).toBe(85);
    expect(low.note.pitch).toBe(35);
    expect(percussion.note.pitch).toBe(90);
    expect(percussion.lyric).toBeNull();
    expect(lyrics(v.view)).toEqual([
      [480, "hel-"],
      [960, "lo"],
      [1440, "oh"],
    ]);
    expect(v.view.getNotes(VocalNoteKind.Pitched)).toHaveLength(1);
    expect(v.view.getNotes().map((n) => n.kind)).toEqual([
      VocalNoteKind.Pitched,
      VocalNoteKind.Pitchless,
      VocalNoteKind.Pitchless,
      VocalNoteKind.Percussion,
    ]);
  });

  it("rejects pitched notes outside the pitched range without touching the track", () => {
    const v = vocals();
    expect(v.addPitched(35, 0, 120, "x")).toBeNull();
    expect(v.addPitched(85, 0, 120, "x")).toBeNull();
    expect(v.addPitched(60, 120, 120, "x")).toBeNull();
    expect(v.midi.getTrack("VOCALS")?.getNotes() ?? []).toHaveLength(0);
  });

  it("moves notes with their lyrics and keeps kinds in their lanes", () => {
    const v = vocals();
    const first = v.addPitched(60, 0, 240, "one")!;
    const second = v.addPitched(62, 480, 720, "two")!;
    const perc = v.addPercussion(960, 1080)!;
    const moves = [
      { note: first.note, start: 480, pitch: 100, lyric: first.lyric! },
      { note: second.note, start: 0, pitch: 20, lyric: second.lyric! },
      { note: perc.note, start: 1200, pitch: 60 },
    ];
    expect(v.view.moveNotes(moves)).toBe(true);

    const byText = new Map(
      v.view.getNotes().map((i) => [i.lyric?.text ?? i.kind, i]),
    );
    expect(byText.get("one")!.note).toMatchObject({ start: 480, pitch: 84 });
    expect(byText.get("two")!.note).toMatchObject({ start: 0, pitch: 36 });
    expect(byText.get(VocalNoteKind.Percussion)!.note).toMatchObject({
      start: 1200,
      pitch: 90,
    });
    expect(v.view.validate()).toEqual([]);
  });

  it("removes lyrics with their notes and sets lyrics on existing notes", () => {
    const v = vocals();
    const keep = v.addPitched(60, 0, 240, "stay")!;
    const drop = v.addPitched(62, 480, 720, "go")!;
    expect(v.view.removeNotes([drop.note])).toBe(true);
    expect(lyrics(v.view)).toEqual([[0, "stay"]]);

    expect(v.view.setLyric(keep.note, "")).toBe(false);
    expect(v.view.setLyric(keep.note, "café")).toBe(true);
    expect(lyrics(v.view)).toEqual([[0, "café"]]);

    const bare = v.addPitched(64, 960, 1200)!;
    expect(v.view.validate().map((i) => i.type)).toEqual(["missing-lyric"]);
    expect(v.view.setLyric(bare.note, "new")).toBe(true);
    expect(v.view.validate()).toEqual([]);
  });

  it("reports orphan and near-miss lyrics and repairs near misses", () => {
    const v = vocals();
    const note = v.addPitched(60, 480, 720)!;
    const track = v.midi.getTrack("VOCALS")!;
    track.addTextEvent(MetaType.Lyric, 485, "late");
    track.addTextEvent(MetaType.Lyric, 4000, "lost");

    expect(v.view.validate().map((i) => [i.type, i.tick])).toEqual([
      ["mismatched-tick", 485],
      ["orphan-lyric", 4000],
    ]);
    expect(v.view.repair()).toBe(1);
    expect(v.view.getVocalNote(note.note)?.lyric?.text).toBe("late");
    expect(v.view.validate().map((i) => i.type)).toEqual(["orphan-lyric"]);
    expect(v.view.repair({ removeOrphans: true })).toBe(1);
    expect(v.view.validate()).toEqual([]);
  });

  it("reads phrases by kind", () => {
    const v = vocals();
    const phrase = v.addPhrase(VocalPhraseKind.Vocal, 0, 960)!;
    expect(phrase).toMatchObject({
      kind: VocalPhraseKind.Vocal,
      start: 0,
      end: 960,
    });
    expect(v.addPhrase(VocalPhraseKind.Vocal, 960, 1440)).not.toBeNull();
    expect(v.addPhrase(VocalPhraseKind.StagePower, 0, 1440)).not.toBeNull();
    expect(v.view.updatePhrase(phrase.note, 120, 900)).toBe(true);
    expect(
      v.view.getPhrases(VocalPhraseKind.Vocal).map((p) => [p.start, p.end]),
    ).toEqual([
      [120, 900],
      [960, 1440],
    ]);
  });

  it("leaves unknown pitches and phrase overlaps to the rule enforcer", () => {
    const track = new MidiTrack("VOCALS");
    const midi = new Midi();
    midi.tracks.push(track);
    track.addNote(96, 0, 100, 960);
    track.addNote(96, 480, 100, 960, track.getInsertionIndexAt(480));
    track.addNote(30, 0, 100, 120);
    // The view's lyric validation no longer reports these...
    expect(vocals(midi).view.validate()).toEqual([]);
    // ...the enforcer does, for the whole track.
    const rules = DefaultCompiledRuleset.byKey.get("vocals")!;
    const notes = track.getNotes().map((n, i) => ({
      id: `n${i}`,
      tick: n.start,
      pitch: n.pitch,
      duration: n.end - n.start,
      velocity: 100,
    }));
    const ids = new RuleEnforcer(DefaultCompiledRuleset)
      .validateTrack(rules, notes, createRulesetContext({ ppqn: 480 }))
      .map((v) => v.ruleId);
    expect(ids).toContain("policy.unknownPitch");
    expect(ids).toContain("implicit.phraseSelfOverlap");
  });
});

describe("fixture VOCALS track", () => {
  it("classifies the shipped chart and pairs every lyric", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const midi = new Midi(fs.readFileSync(path.join(dir, "..", "song.mid")));
    const { view } = vocals(midi);
    expect(view.getNotes(VocalNoteKind.Pitched)).toHaveLength(492);
    expect(view.getNotes(VocalNoteKind.Pitchless)).toHaveLength(1);
    expect(view.getPhrases(VocalPhraseKind.Vocal)).toHaveLength(48);
    expect(view.getPhrases(VocalPhraseKind.PowerWindow)).toHaveLength(39);
    expect(view.getPhrases(VocalPhraseKind.StagePower)).toHaveLength(11);
    const issues = view.validate();
    // Every lyric in the shipped chart sits on a note tick.
    expect(
      issues.filter((issue) => issue.type === "orphan-lyric"),
    ).toHaveLength(0);
  });
});
