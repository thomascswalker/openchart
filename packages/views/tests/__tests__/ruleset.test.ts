import { describe, expect, it } from "vitest";
import { DefaultRuleset } from "../../src/config.js";
import {
  DefaultCompiledRuleset as C,
  RuleEnforcer,
  classifyPitch,
  compileRuleset,
  createRulesetContext,
  createUnmappedTrackRules,
  difficultyFromName,
  difficultyName,
  evaluateCondition,
  isWithinThreshold,
  resolveThresholdTicks,
  toTrackKey,
  type EnforcerNote,
  type TrackRules,
} from "../../src/ruleset/index.js";
import { Difficulty } from "../../src/types.js";

const rules = (key: string): TrackRules => C.byKey.get(key)!;
const note = (
  id: string,
  tick: number,
  pitch: number,
  duration = 1,
): EnforcerNote => ({
  id,
  tick,
  pitch,
  duration,
  velocity: 100,
});
const enforcer = new RuleEnforcer(C);
const ctx = createRulesetContext({ ppqn: 480 });
const check = (
  r: TrackRules | null,
  notes: EnforcerNote[],
  touched: string[],
) =>
  enforcer
    .checkEdits(
      [{ trackIndex: 0, rules: r, notes, touched: new Set(touched) }],
      ctx,
    )
    .map((v) => `${v.ruleId}:${v.severity}`);

describe("compileRuleset", () => {
  it("emits one TrackRules per track name with kebab-case keys", () => {
    expect(C.tracks.map((t) => t.key)).toEqual([
      "chart-header",
      "global",
      "lead-guitar",
      "rhythm-guitar",
      "drums",
      "vocals",
      "four-pad",
      "five-pad",
    ]);
    expect(toTrackKey("FOUR PAD")).toBe("four-pad");
  });

  it("derives visible/editable policy", () => {
    expect(rules("chart-header")).toMatchObject({
      visible: false,
      editable: false,
    });
    expect(rules("global")).toMatchObject({ visible: true, editable: false });
    expect(rules("lead-guitar")).toMatchObject({
      visible: true,
      editable: true,
    });
  });

  it("reproduces today's column counts", () => {
    expect(rules("lead-guitar").columns).toHaveLength(5);
    expect(rules("drums").columns).toHaveLength(4);
    expect(rules("drums").bars.map((l) => l.id)).toEqual(["kick"]);
    expect(rules("four-pad").columns).toHaveLength(4);
    expect(rules("five-pad").columns).toHaveLength(5);
    expect(rules("lead-guitar").columns.map((l) => l.column)).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  it("resolves lane → pitch and marker → pitch", () => {
    const expert = rules("drums").difficulties.get(Difficulty.Expert)!;
    expect(expert.pitchForLane("kick")).toBe(96);
    expect(expert.pitchForLane("yellow", "cymbal")).toBe(101);
    expect(expert.pitchForMarker("flam")).toBe(104);
  });

  it("maps difficulty names both ways", () => {
    expect(difficultyName(Difficulty.Hard)).toBe("hard");
    expect(difficultyFromName("easy")).toBe(Difficulty.Easy);
  });

  it("skips todo constraints", () => {
    const r = structuredClone(DefaultRuleset);
    const guitar = r.tracks.find((t) => t.id === "guitar")!;
    guitar.constraints = guitar.constraints!.map((c) => ({
      ...c,
      status: "todo" as const,
    }));
    expect(
      compileRuleset(r).byKey.get("lead-guitar")!.constraints,
    ).toHaveLength(0);
  });

  it("creates unconstrained rules for unmapped tracks", () => {
    const u = createUnmappedTrackRules("SYNTH", "synth");
    expect(u).toMatchObject({ key: "synth", visible: true, editable: true });
    expect(check(u, [note("a", 0, 5)], ["a"])).toEqual([]);
  });
});

describe("classifyPitch", () => {
  const drums = rules("drums");
  it("classifies each role", () => {
    expect(classifyPitch(drums, 97, Difficulty.Expert)).toMatchObject({
      kind: "laneNote",
      laneId: "red",
      padType: "tom",
    });
    expect(classifyPitch(drums, 96, Difficulty.Expert)).toMatchObject({
      kind: "laneNote",
      bar: true,
    });
    expect(classifyPitch(drums, 104, Difficulty.Expert)).toMatchObject({
      kind: "marker",
      effect: "flam",
    });
    expect(classifyPitch(drums, 118, Difficulty.Expert)).toMatchObject({
      kind: "phrase",
      id: "solo",
    });
    expect(classifyPitch(drums, 105, Difficulty.Expert)).toEqual({
      kind: "reserved",
    });
    expect(classifyPitch(drums, 20, Difficulty.Expert)).toEqual({
      kind: "unknown",
    });
    expect(classifyPitch(rules("vocals"), 60, null)).toMatchObject({
      kind: "noteClass",
      class: "pitched",
    });
    expect(classifyPitch(rules("global"), 13, null)).toMatchObject({
      kind: "eventNote",
      id: "beatlines",
      valueIndex: 1,
    });
  });

  it("searches every difficulty with null", () => {
    expect(classifyPitch(drums, 61, null)).toMatchObject({
      kind: "laneNote",
      difficulty: Difficulty.Easy,
    });
    expect(classifyPitch(drums, 61, Difficulty.Expert)).toEqual({
      kind: "unknown",
    });
  });
});

describe("resolveThresholdTicks", () => {
  const th = (value: object, extra: object = {}) =>
    ({ value, ...extra }) as never;
  it("supports every unit", () => {
    expect(
      resolveThresholdTicks(th({ unit: "step", denominator: 12 }), {
        ppqn: 480,
      }),
    ).toBe(160);
    expect(
      resolveThresholdTicks(th({ unit: "ticks", ticks: 7 }), { ppqn: 480 }),
    ).toBe(7);
    expect(
      resolveThresholdTicks(
        th({
          unit: "resolutionFormula",
          divisor: 3,
          addTicks: 1,
          rounding: "floor",
        }),
        { ppqn: 480 },
      ),
    ).toBe(161);
    expect(
      resolveThresholdTicks(th({ unit: "seconds", seconds: 1 }), { ppqn: 480 }),
    ).toBeNull();
    expect(
      resolveThresholdTicks(th({ unit: "seconds", seconds: 1 }), {
        ppqn: 480,
        secondsToTicks: (s) => s * 960,
      }),
    ).toBe(960);
  });
  it("applies overrides then maxTicks", () => {
    const t = th(
      { unit: "step", denominator: 120 },
      {
        maxTicks: 16,
        overrides: [{ source: "infoJson", key: "PositionSnap" }],
      },
    );
    expect(resolveThresholdTicks(t, { ppqn: 480 })).toBe(16);
    expect(resolveThresholdTicks(t, { ppqn: 480, settings: () => 8 })).toBe(8);
    expect(resolveThresholdTicks(t, { ppqn: 480, settings: () => 99 })).toBe(
      16,
    );
  });
  it("honours inclusivity", () => {
    expect(
      isWithinThreshold(
        160,
        th({ unit: "ticks", ticks: 160 }, { inclusive: true }),
        { ppqn: 480 },
      ),
    ).toBe(true);
    expect(
      isWithinThreshold(160, th({ unit: "ticks", ticks: 160 }), { ppqn: 480 }),
    ).toBe(false);
  });
  it("resolves the default guitar mechanics to 160", () => {
    const m = rules("lead-guitar").mechanics!;
    expect(resolveThresholdTicks(m.hopoThreshold!, { ppqn: 480 })).toBe(160);
    expect(resolveThresholdTicks(m.sustainCutoff!, { ppqn: 480 })).toBe(160);
  });
});

describe("evaluateCondition", () => {
  const base = {
    playerOptions: new Set<string>(),
    settings: () => undefined,
    variant: null,
    textEventsAt: () => new Set<string>(),
  };
  it("defaults player options to empty", () => {
    expect(evaluateCondition({ playerOption: "expertPlus" }, base)).toBe(false);
    expect(
      evaluateCondition(
        { playerOption: "expertPlus" },
        { ...base, playerOptions: new Set(["expertPlus"]) },
      ),
    ).toBe(true);
  });
  it("supports allOf / anyOf / not", () => {
    const yes = { playerOption: "a" };
    const c = { ...base, playerOptions: new Set(["a"]) };
    expect(
      evaluateCondition({ allOf: [yes, { not: { variant: "x" } }] }, c),
    ).toBe(true);
    expect(
      evaluateCondition(
        { anyOf: [{ variant: "x" }, { playerOption: "b" }] },
        c,
      ),
    ).toBe(false);
  });
  it("evaluates settings and text events", () => {
    const c = {
      ...base,
      settings: (s: string, k: string) =>
        s === "infoJson" && k === "K" ? 5 : undefined,
      textEventsAt: () => new Set(["end"]),
    };
    expect(
      evaluateCondition(
        { setting: { source: "infoJson", key: "K", equals: 5 } },
        c,
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { setting: { source: "infoJson", key: "Z", present: false } },
        c,
      ),
    ).toBe(true);
    expect(evaluateCondition({ textEvent: "end" }, c)).toBe(true);
  });
});

describe("RuleEnforcer", () => {
  const lead = rules("lead-guitar");
  const g = lead.difficulties.get(Difficulty.Expert)!;
  const green = g.pitchForLane("green")!;
  const red = g.pitchForLane("red")!;

  it("accepts a valid note", () => {
    expect(check(lead, [note("a", 0, green)], ["a"])).toEqual([]);
  });
  it("applies the unknown-pitch policy", () => {
    expect(check(lead, [note("a", 0, 20)], ["a"])).toEqual([
      "policy.unknownPitch:error",
    ]);
  });
  it("applies the reserved-pitch policy", () => {
    expect(check(rules("drums"), [note("a", 0, 105)], ["a"])).toEqual([
      "policy.reservedPitch:error",
    ]);
  });
  it("rejects zero-length notes", () => {
    expect(check(lead, [note("a", 0, green, 0)], ["a"])).toEqual([
      "policy.zeroLength:error",
    ]);
  });
  it("ignores notes on disabled pitches whose whenDisabled is ignore", () => {
    expect(check(rules("drums"), [note("a", 0, 95)], ["a"])).toEqual([]);
  });
  it("flags lanes that do not exist on the track", () => {
    const orange = rules("four-pad")
      .difficulties.get(Difficulty.Expert)!
      .pitchForLane("orange")!;
    expect(check(rules("four-pad"), [note("a", 0, orange)], ["a"])).toEqual([
      "policy.laneDisabled:error",
    ]);
    expect(check(rules("five-pad"), [note("a", 0, orange)], ["a"])).toEqual([]);
  });
  it("noOverlappingSameLane", () => {
    expect(
      check(lead, [note("a", 0, green, 1000), note("b", 480, green)], ["b"]),
    ).toEqual(["noSameFretSustainOverlap:error"]);
    expect(
      check(lead, [note("a", 0, green, 1000), note("b", 480, red)], ["b"]),
    ).toEqual([]);
    expect(
      check(lead, [note("a", 0, green, 1000), note("b", 1000, green)], ["b"]),
    ).toEqual([]);
  });
  it("short notes below the sustain cutoff are not sustains", () => {
    expect(
      check(lead, [note("a", 0, green, 100), note("b", 50, green)], ["b"]),
    ).toEqual([]);
  });
  it("mutuallyExclusiveAtTick", () => {
    const hopo = g.pitchForMarker("forceHopo")!;
    const strum = g.pitchForMarker("forceStrum")!;
    expect(
      check(
        lead,
        [note("a", 0, green), note("h", 0, hopo), note("s", 0, strum)],
        ["s"],
      ),
    ).toEqual(["forceConflict:warning"]);
    expect(
      check(
        lead,
        [note("a", 0, green), note("h", 0, hopo), note("s", 480, strum)],
        ["s"],
      ),
    ).toEqual([]);
  });
  it("implicit.phraseSelfOverlap", () => {
    expect(
      check(lead, [note("p1", 0, 116, 500), note("p2", 250, 116, 500)], ["p2"]),
    ).toEqual(["implicit.phraseSelfOverlap:error"]);
    expect(
      check(lead, [note("p1", 0, 116, 500), note("p2", 500, 116, 500)], ["p2"]),
    ).toEqual([]);
  });
  it("phrasesMayNotOverlap and phraseMustBeBetween", () => {
    const v = rules("vocals");
    expect(
      check(
        v,
        [
          note("p1", 0, 96, 100),
          note("w", 150, 111, 50),
          note("p2", 300, 96, 100),
        ],
        ["w"],
      ),
    ).toEqual([]);
    expect(check(v, [note("w", 0, 111, 100)], ["w"])).toEqual([
      "windowBetweenPhrases:error",
    ]);
    expect(
      check(
        v,
        [
          note("p1", 0, 96, 100),
          note("w", 50, 111, 100),
          note("p2", 300, 96, 100),
        ],
        ["w"],
      ),
    ).toEqual(["windowVsVocalPhrase:error", "windowBetweenPhrases:error"]);
  });
  it("validateTrack treats every note as touched", () => {
    const out = enforcer.validateTrack(lead, [note("a", 0, 20)], ctx);
    expect(out).toHaveLength(1);
  });
  it("only reports violations involving touched notes", () => {
    expect(check(lead, [note("a", 0, 20), note("b", 0, green)], ["b"])).toEqual(
      [],
    );
  });
});
