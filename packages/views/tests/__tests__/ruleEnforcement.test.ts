import { MetaType, Midi, MidiTrack } from "@openchart/midi";
import { describe, expect, it } from "vitest";
import {
  DefaultCompiledRuleset,
  DefaultRuleset,
  Difficulty,
  EditRejectedError,
  compileRuleset,
  createStandaloneEditing,
  formatNoteId,
  type CompiledRuleset,
} from "../../src/index.js";

function setup(
  trackName: string,
  rules: CompiledRuleset = DefaultCompiledRuleset,
) {
  const midi = new Midi();
  const sync = new MidiTrack("");
  const track = new MidiTrack(trackName);
  midi.tracks = [sync, track];
  const key = rules.byName.get(trackName)!.key;
  return { midi, track, rules, key };
}

function session(
  s: ReturnType<typeof setup>,
  hostKind: string,
  difficulty: Difficulty | null = Difficulty.Expert,
) {
  return createStandaloneEditing(s.midi, s.rules).createSession(
    { trackKey: s.key, trackIndex: 1, difficulty },
    hostKind,
  );
}

describe("edit enforcement through the session", () => {
  it("rejects an error-level violation and leaves MIDI untouched", () => {
    const s = setup("LEAD GUITAR");
    s.track.insertNote({ tick: 0, pitch: 96, duration: 960 });
    const before = s.midi.toBuffer();
    const result = session(s, "highway").execute({
      type: "PLACE_CHART_NOTE",
      lane: 0,
      tick: 480,
      placement: "normal",
      cutPolicy: "none",
    });
    expect(result.changed).toBe(false);
    expect(result.rejections.map((r) => r.code)).toEqual([
      "rule:noSameFretSustainOverlap",
    ]);
    expect(s.midi.toBuffer()).toEqual(before);
  });

  it("throws on rule rejection when throwOnReject is set", () => {
    const s = setup("LEAD GUITAR");
    s.track.insertNote({ tick: 0, pitch: 96, duration: 960 });
    expect(() =>
      session(s, "highway").execute(
        {
          type: "PLACE_CHART_NOTE",
          lane: 0,
          tick: 480,
          placement: "normal",
          cutPolicy: "none",
        },
        { throwOnReject: true },
      ),
    ).toThrow(EditRejectedError);
  });

  it("commits warnings and reports them as diagnostics", () => {
    const s = setup("LEAD GUITAR");
    const result = session(s, "piano-roll").execute({
      type: "ADD_NOTES",
      notes: [
        { trackIndex: 1, tick: 480, pitch: 101, duration: 1 }, // forceHopo
        { trackIndex: 1, tick: 480, pitch: 102, duration: 1 }, // forceStrum
      ],
    });
    expect(result.changed).toBe(true);
    expect(result.rejections).toEqual([]);
    expect(result.diagnostics.map((d) => `${d.ruleId}:${d.severity}`)).toEqual([
      "forceConflict:warning",
    ]);
    expect(s.track.getNotes()).toHaveLength(2);
  });

  it("applies unknown-pitch policy to raw edits on configured tracks only", () => {
    const configured = setup("LEAD GUITAR");
    const add = {
      type: "ADD_NOTES" as const,
      notes: [{ trackIndex: 1, tick: 0, pitch: 20, duration: 10 }],
    };
    expect(
      session(configured, "piano-roll")
        .execute(add)
        .rejections.map((r) => r.code),
    ).toEqual(["rule:policy.unknownPitch"]);

    const unmapped = setup("LEAD GUITAR");
    unmapped.track.name = "SYNTH";
    const rules = compileRuleset(DefaultRuleset);
    const editing = createStandaloneEditing(unmapped.midi, rules);
    const s = editing.createSession(
      { trackKey: "synth", trackIndex: 1, difficulty: null },
      "piano-roll",
    );
    expect(s.execute(add).changed).toBe(true);
  });

  it("previews report rule errors as rejections and warnings as diagnostics", () => {
    const s = setup("LEAD GUITAR");
    s.track.insertNote({ tick: 0, pitch: 96, duration: 960 });
    const gesture = session(s, "highway").beginGesture();
    const preview = gesture.preview({
      type: "PLACE_CHART_NOTE",
      lane: 0,
      tick: 480,
      placement: "normal",
      cutPolicy: "none",
    });
    expect(preview.rejections.map((r) => r.code)).toContain(
      "rule:noSameFretSustainOverlap",
    );
    gesture.cancel();
    expect(s.track.getNotes()).toHaveLength(1);
  });

  it("vocal phrase moves fall back to the previous valid offset", () => {
    const s = setup("VOCALS");
    s.track.insertNote({ tick: 0, pitch: 116, duration: 100 });
    s.track.insertNote({ tick: 200, pitch: 116, duration: 100 });
    const id = formatNoteId(
      1,
      s.track.getEventId(s.track.getNotes()[0]!.noteOn),
    );
    const result = session(s, "piano-roll", null).execute({
      type: "MOVE_VOCAL_ENTITIES",
      targetIds: [id],
      tickDelta: 150,
      pitchDelta: 0,
      previousValidTickDelta: 50,
    });
    expect(result.rejections).toEqual([]);
    expect(
      s.track.getNotes().find((n) => n.pitch === 116 && n.start < 200)?.start,
    ).toBe(50);
  });

  it("a power window must sit between vocal phrases", () => {
    const s = setup("VOCALS");
    s.track.insertNote({ tick: 0, pitch: 96, duration: 100 });
    s.track.insertNote({ tick: 300, pitch: 96, duration: 100 });
    const vocals = session(s, "piano-roll", null);
    const add = (tick: number) =>
      vocals.execute({
        type: "CREATE_VOCAL_PHRASE",
        phraseKind: "power-window",
        startTick: tick,
        endTick: tick + 50,
      });
    expect(add(150).rejections).toEqual([]);
    expect(add(500).rejections.map((r) => r.code)).toEqual([
      "rule:windowBetweenPhrases",
    ]);
  });

  it("checks text events on configured tracks against the grammar", () => {
    const s = setup("GLOBAL");
    const global = createStandaloneEditing(s.midi, s.rules).createSession(
      { trackKey: "global", trackIndex: 1, difficulty: null },
      "global",
    );
    const text = (t: string, metaType: number = MetaType.Text) =>
      global.execute({
        type: "ADD_TEXT",
        trackIndex: 1,
        metaType,
        tick: 0,
        text: t,
      } as never);
    expect(text("[section Verse]").changed).toBe(true);
    expect(text("hello").rejections.map((r) => r.code)).toEqual([
      "rule:policy.unknownTextEvent",
    ]);
    expect(text("[bogus]").rejections.map((r) => r.code)).toEqual([
      "rule:policy.unknownTextEvent",
    ]);
    // Meta types outside the grammar's metaEventTypes are not text events.
    expect(text("anything", MetaType.Marker).changed).toBe(true);
    expect(
      global.execute({ type: "ADD_SECTION", tick: 960, name: "Chorus" })
        .changed,
    ).toBe(true);
    expect(
      s.midi.tracks[1]!.getTextEvents().map((e) => [e.type, e.text]),
    ).toContainEqual([MetaType.Text, "[section Chorus]"]);
  });
});

describe("the hierarchy is dynamic", () => {
  it("a ruleset without DRUMS has no drum descriptors or modes", () => {
    const ruleset = structuredClone(DefaultRuleset);
    ruleset.tracks = ruleset.tracks.filter((t) => t.kind !== "drums");
    const rules = compileRuleset(ruleset);
    expect(rules.descriptors().map((d) => d.name)).not.toContain("DRUMS");
    expect(rules.byName.get("DRUMS")).toBeUndefined();
  });

  it("changing FOUR PAD lanes changes columns, placement and enforcement", () => {
    const ruleset = structuredClone(DefaultRuleset);
    const pad = ruleset.tracks.find((t) => t.id === "gamepad")!;
    if (pad.kind !== "gamepad") throw new Error("expected gamepad");
    for (const lane of pad.lanes) delete lane.onlyOnTracks; // orange exists on FOUR PAD too
    const rules = compileRuleset(ruleset);
    expect(rules.byName.get("FOUR PAD")!.columns).toHaveLength(5);

    const s = setup("FOUR PAD", rules);
    const result = session(s, "highway").execute({
      type: "PLACE_CHART_NOTE",
      lane: 4,
      tick: 0,
      placement: "normal",
      cutPolicy: "none",
    });
    expect(result.rejections).toEqual([]);
    expect(s.track.getNotes().map((n) => n.pitch)).toEqual([100]);
  });
});
