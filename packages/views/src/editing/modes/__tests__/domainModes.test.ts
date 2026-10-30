import { MetaType, Midi, MidiTrack } from "@openchart/midi";
import { describe, expect, it } from "vitest";
import characterization from "./fixtures/characterization/editing.json" with { type: "json" };
import {
  CompiledRuleset,
  DefaultCompiledRuleset,
  compileRuleset,
} from "../../../ruleset/compile.js";
import { DefaultRuleset } from "../../../ruleset/config.js";
import { Difficulty } from "../../../ruleset/difficulty.js";
import { VocalNoteKind, VocalPhraseKind } from "../../../views/vocal.js";
import { DomainCommandType, GeneralCommandType } from "../../commands.js";
import { formatNoteId } from "../../entity.js";
import { EditingSession } from "../../session.js";
import { createStandaloneEditing } from "../../standalone.js";
import { createDefaultModeRegistry } from "../index.js";
import { EditingModeId } from "../mode.js";

type FretPlacement = "normal" | "force-hopo" | "force-strum" | "tap";

const difficultyValues = [
  Difficulty.Easy,
  Difficulty.Medium,
  Difficulty.Hard,
  Difficulty.Expert,
];

function makeMidi(trackName: string): { midi: Midi; track: MidiTrack } {
  const midi = new Midi();
  const track = new MidiTrack(trackName);
  midi.tracks = [track];
  return { midi, track };
}

function makeSession(
  midi: Midi,
  trackName: string,
  difficulty: Difficulty | null,
  hostKind: string,
  rules: CompiledRuleset = DefaultCompiledRuleset,
): EditingSession {
  const descriptor = rules.byName.get(trackName)!;
  const trackIndex = midi.tracks.findIndex((track) => track.name === trackName);
  return createStandaloneEditing(midi, rules).createSession(
    {
      trackKey: descriptor.key,
      trackIndex: trackIndex < 0 ? null : trackIndex,
      difficulty,
    },
    hostKind,
  );
}

function noteId(track: MidiTrack, trackIndex: number, noteIndex = 0) {
  const note = track.getNotes()[noteIndex]!;
  return formatNoteId(trackIndex, track.getEventId(note.noteOn));
}

/** Old placement names -> ruleset placement tokens. */
const PLACEMENT_TOKEN: Record<string, string> = {
  normal: "normal",
  "force-hopo": "marker:forceHopo",
  "force-strum": "marker:forceStrum",
  tap: "marker:forceTap",
};

function placeFretsMarker(
  placement: FretPlacement,
  difficulty: Difficulty,
  existingMarkers: readonly number[] = [],
) {
  const { midi, track } = makeMidi("LEAD GUITAR");
  for (const pitch of existingMarkers) {
    track.insertNote({ tick: 480, pitch, duration: 1 });
  }
  const session = makeSession(midi, "LEAD GUITAR", difficulty, "highway");
  const result = session.execute({
    type: DomainCommandType.PlaceChartNote,
    lane: 0,
    tick: 480,
    placement: PLACEMENT_TOKEN[placement as FretPlacement],
    cutPolicy: "none",
  });
  return { track, result };
}

describe("default editing modes", () => {
  it("resolves every configured track against both editing hosts", () => {
    const registry = createDefaultModeRegistry();
    const expected = (kind: string, host: string) => {
      if (kind === "vocals")
        return host === "piano-roll" ? EditingModeId.MidiVocals : null;
      if (kind === "guitar" || kind === "drums" || kind === "gamepad") {
        return host === "highway"
          ? EditingModeId.ChartLanes
          : EditingModeId.MidiRaw;
      }
      return null;
    };

    for (const track of DefaultCompiledRuleset.descriptors()) {
      for (const host of ["piano-roll", "highway"]) {
        expect(registry.resolve(track, host)?.id ?? null).toBe(
          expected(track.kind, host),
        );
        expect(registry.canHost(track, host)).toBe(
          expected(track.kind, host) !== null,
        );
      }
    }
    expect(registry.listForHost("highway").map((mode) => mode.id)).toEqual([
      EditingModeId.ChartLanes,
    ]);
  });

  it("uses ruleset lanes and pitches for fret and drum layouts", () => {
    const lead = DefaultCompiledRuleset.byName.get("LEAD GUITAR")!;
    const drums = DefaultCompiledRuleset.byName.get("DRUMS")!;
    expect(
      lead.difficulties.get(Difficulty.Expert)!.pitchForMarker("forceHopo"),
    ).toBe(101);

    difficultyValues.forEach((difficulty, index) => {
      const chart = drums.difficulties.get(difficulty)!;
      expect(chart.pitchForLane("kick")).toBe(
        characterization.drums.offsets[index],
      );
      const cymbalLanes = ["red", "yellow", "blue", "green"];
      cymbalLanes.forEach((laneId, lane) => {
        expect(chart.pitchForLane(laneId, "tom") ?? null).toBe(
          characterization.drums.placements.pad[index]![lane],
        );
        expect(chart.pitchForLane(laneId, "cymbal") ?? null).toBe(
          characterization.drums.placements.cymbal[index]![lane],
        );
      });
    });
  });

  it("places drum kinds at every configured difficulty and lane", () => {
    for (const [difficultyIndex, difficulty] of difficultyValues.entries()) {
      const expectedPlacements = characterization.drums.placements;
      for (const kind of ["pad", "cymbal", "kick"] as const) {
        for (let lane = 0; lane < 4; lane++) {
          const { midi, track } = makeMidi("DRUMS");
          const session = makeSession(midi, "DRUMS", difficulty, "highway");
          const expected = expectedPlacements[kind][difficultyIndex]![lane];
          const result = session.execute({
            type: DomainCommandType.PlaceChartNote,
            lane,
            tick: 480,
            placement: {
              pad: "normal",
              cymbal: "padType:cymbal",
              kick: "bar:kick",
            }[kind],
          });
          if (expected === null) {
            expect(result.rejections[0]?.code).toBe("invalid-lane");
            expect(track.getNotes()).toEqual([]);
          } else {
            expect(result.rejections).toEqual([]);
            expect(track.getNotes().map((note) => note.pitch)).toEqual([
              expected,
            ]);
          }
        }
      }
    }
  });

  it("projects configured frets lanes and creates or updates configured phrases", () => {
    const { midi, track } = makeMidi("LEAD GUITAR");
    const note = track.insertNote({ tick: 480, pitch: 96, duration: 120 });
    const session = makeSession(
      midi,
      "LEAD GUITAR",
      Difficulty.Expert,
      "highway",
    );
    const projection = session.getProjection();
    expect(projection.getRows().map((row) => row.label)).toEqual([
      "Green",
      "Red",
      "Yellow",
      "Blue",
      "Orange",
    ]);
    expect(projection.pitchForRow(projection.getRows()[4]!, {})).toBe(100);
    expect(
      projection.rowForNote({
        id: formatNoteId(0, track.getEventId(note.noteOn)),
        trackIndex: 0,
        tick: 480,
        pitch: 96,
        duration: 120,
        velocity: 100,
      })?.id,
    ).toBe("0");

    const created = session.execute({
      type: DomainCommandType.CreatePhrase,
      phraseId: "stagePower",
      startTick: 960,
      endTick: 1200,
    });
    expect(created.rejections).toEqual([]);
    const phrase = track
      .getNotes()
      .find((candidate) => candidate.pitch === 116)!;
    const phraseId = formatNoteId(0, track.getEventId(phrase.noteOn));
    const updated = session.execute({
      type: DomainCommandType.UpdatePhrase,
      id: phraseId,
      startTick: 720,
      endTick: 1440,
    });
    expect(updated.rejections).toEqual([]);
    expect(
      track.getNotes().find((candidate) => candidate.noteOn === phrase.noteOn),
    ).toMatchObject({ start: 720, end: 1440 });
  });

  it("replays stagepower and solo phrase creation, movement, and edge clamps", () => {
    const { midi, track } = makeMidi("LEAD GUITAR");
    const session = makeSession(
      midi,
      "LEAD GUITAR",
      Difficulty.Expert,
      "highway",
    );
    const fixture = characterization.phrases;
    for (const kind of ["stagepower", "solo"] as const) {
      const phraseFixture = kind === "stagepower" ? fixture : fixture.solo;
      const phraseId = kind === "stagepower" ? "stagePower" : "solo";
      const pitch = DefaultCompiledRuleset.byName
        .get("LEAD GUITAR")!
        .phrases.find((p) => p.id === phraseId)!.pitches[0]!;
      const created = session.execute({
        type: DomainCommandType.CreatePhrase,
        phraseId,
        startTick: phraseFixture.create.expected[0],
        endTick: phraseFixture.create.expected[1],
      });
      expect(created.rejections).toEqual([]);
      const phrase = track.getNotes().find((note) => note.pitch === pitch)!;
      const id = formatNoteId(0, track.getEventId(phrase.noteOn));
      const updates =
        kind === "stagepower"
          ? [
              {
                start: fixture.move.expected[0],
                end: fixture.move.expected[1],
              },
              {
                start: fixture.resizeStart.expected[0],
                end: fixture.resizeStart.expected[1],
              },
              {
                start: fixture.resizeEnd.expected[0],
                end: fixture.resizeEnd.expected[1],
              },
            ]
          : [
              {
                start: fixture.solo.move.expected[0],
                end: fixture.solo.move.expected[1],
              },
              {
                start: fixture.solo.resizeStart.expected[0],
                end: fixture.solo.resizeStart.expected[1],
              },
              {
                start: fixture.solo.resizeEnd.expected[0],
                end: fixture.solo.resizeEnd.expected[1],
              },
            ];
      for (const update of updates) {
        const result = session.execute({
          type: DomainCommandType.UpdatePhrase,
          id,
          startTick: update.start,
          endTick: update.end,
        });
        expect(result.rejections).toEqual([]);
        expect(
          track.getNotes().find((note) => note.noteOn === phrase.noteOn),
        ).toMatchObject({ start: update.start, end: update.end });
      }
    }
  });

  it("rejects forced-marker placement when the difficulty has no such marker", () => {
    const ruleset = structuredClone(DefaultRuleset);
    const lead = ruleset.tracks.find((track) => track.id === "guitar")!;
    if (lead.kind !== "guitar") throw new Error("Expected a guitar track");
    const expert = lead.difficulties.expert!;
    expert.markers = expert.markers!.filter((m) => m.effect !== "forceHopo");
    const { midi, track } = makeMidi("LEAD GUITAR");
    const session = makeSession(
      midi,
      "LEAD GUITAR",
      Difficulty.Expert,
      "highway",
      compileRuleset(ruleset),
    );
    const before = midi.toBuffer();
    const result = session.execute({
      type: DomainCommandType.PlaceChartNote,
      lane: 0,
      tick: 480,
      placement: "marker:forceHopo",
      cutPolicy: "none",
    });
    expect(result.rejections[0]?.code).toBe("missing-config-note");
    expect(track.getNotes()).toEqual([]);
    expect(midi.toBuffer()).toEqual(before);
  });

  it("moves frets notes with lane and tick clamps", () => {
    const { midi, track } = makeMidi("LEAD GUITAR");
    const note = track.insertNote({ tick: 480, pitch: 96, duration: 120 });
    const session = makeSession(
      midi,
      "LEAD GUITAR",
      Difficulty.Expert,
      "highway",
    );
    const result = session.execute({
      type: DomainCommandType.MoveChartNotes,
      targetIds: [formatNoteId(0, track.getEventId(note.noteOn))],
      tickDelta: -960,
      laneDelta: 99,
    });
    expect(result.rejections).toEqual([]);
    expect(track.getNotes()[0]).toMatchObject({ start: 0, pitch: 100 });
  });

  it("replays forced-marker replacement and duplicate suppression through chart.lanes", () => {
    const { difficulties, placementOrder, expectedByPlacement } =
      characterization.forcedMarkers;
    const placements = placementOrder as FretPlacement[];
    for (const [index, item] of difficulties.entries()) {
      const difficulty = difficultyValues[index]!;
      const markers = item.markers;
      for (const placement of placements) {
        const { track, result } = placeFretsMarker(
          placement,
          difficulty,
          markers,
        );
        expect(result.rejections).toEqual([]);
        const expectedIndices =
          expectedByPlacement[placement as keyof typeof expectedByPlacement];
        const expected = expectedIndices.map(
          (markerIndex) => markers[markerIndex]!,
        );
        expect(
          track
            .getNotes()
            .map((note) => note.pitch)
            .filter((pitch) => markers.includes(pitch))
            .sort((left, right) => left - right),
        ).toEqual(expected.sort((left, right) => left - right));
      }
    }
  });

  it("replays sustain cut policies and end clamping through chart.lanes", () => {
    const fixture = characterization.sustains;
    const cutPolicy = (
      shiftKey: boolean,
      preferredPresent: boolean,
      sameLanePlacement: boolean,
    ) => {
      if (!preferredPresent) return shiftKey ? "none" : "all";
      if (sameLanePlacement) return shiftKey ? "preferred-only" : "all";
      return shiftKey ? "all" : "preferred-only";
    };
    for (const testCase of fixture.cutCases) {
      const { midi, track } = makeMidi("LEAD GUITAR");
      // Distinct lanes: same-lane sustains may not overlap (ruleset constraint).
      fixture.notes.forEach((item, index) => {
        track.insertNote({
          tick: item.start,
          pitch: 96 + index,
          duration: item.end - item.start,
        });
      });
      const session = makeSession(
        midi,
        "LEAD GUITAR",
        Difficulty.Expert,
        "highway",
      );
      const ids = track.getNotes().map((_, index) => noteId(track, 0, index));
      const preferredSustainId = testCase.preferredPresent ? ids[0] : undefined;
      const result = session.execute({
        type: DomainCommandType.CutSustains,
        tick: fixture.tick,
        cutPolicy: cutPolicy(
          testCase.shiftKey,
          testCase.preferredPresent,
          testCase.sameLanePlacement,
        ),
        ...(preferredSustainId ? { preferredSustainId } : {}),
      });
      expect(result.rejections).toEqual([]);
      const actual = track
        .getNotes()
        .filter((note) => note.end === fixture.tick)
        .map((note) => (note.start === 0 ? "preferred" : "other"));
      expect(actual.sort()).toEqual([...testCase.expected].sort());
    }

    for (const extendPastNext of ["stop-at-next", "allow"] as const) {
      const { midi, track } = makeMidi("LEAD GUITAR");
      track.insertNote({ tick: 480, pitch: 96, duration: 480 });
      track.insertNote({ tick: 840, pitch: 97, duration: 120 });
      const session = makeSession(
        midi,
        "LEAD GUITAR",
        Difficulty.Expert,
        "highway",
      );
      const target = formatNoteId(
        0,
        track.getEventId(
          track.getNotes().find((note) => note.start === 480)!.noteOn,
        ),
      );
      const result = session.execute({
        type: DomainCommandType.SetSustainEnd,
        targetIds: [target],
        endTick: fixture.end.pointerTick,
        extendPastNext,
      });
      expect(result.rejections).toEqual([]);
      expect(result.changed).toBe(true);
      expect(track.getNotes().find((note) => note.start === 480)!.end).toBe(
        extendPastNext === "allow"
          ? fixture.end.withExtended
          : fixture.end.withoutExtended,
      );
    }
  });

  it("replays drum move and paste rules, including Kick2 and marker clipping", () => {
    const { midi, track } = makeMidi("DRUMS");
    const kick2 = track.insertNote({ tick: 480, pitch: 95, duration: 120 });
    const cymbal = track.insertNote({ tick: 480, pitch: 101, duration: 120 });
    const marker = track.insertNote({ tick: 480, pitch: 104, duration: 120 });
    const session = makeSession(midi, "DRUMS", Difficulty.Expert, "highway");
    const ids = track.getNotes().map((_, index) => noteId(track, 0, index));

    expect(
      session.execute({
        type: DomainCommandType.MoveChartNotes,
        targetIds: [ids[0]!],
        tickDelta: 240,
        laneDelta: 3,
      }).rejections,
    ).toEqual([]);
    expect(
      track.getNotes().find((note) => note.noteOn === kick2.noteOn),
    ).toMatchObject({ pitch: 95, start: 720 });
    expect(
      session.execute({
        type: DomainCommandType.MoveChartNotes,
        targetIds: [ids[1]!],
        tickDelta: 240,
        laneDelta: 1,
      }).rejections,
    ).toEqual([]);
    expect(
      track.getNotes().find((note) => note.noteOn === cymbal.noteOn)?.pitch,
    ).toBe(102);
    expect(
      session.execute({
        type: DomainCommandType.MoveChartNotes,
        targetIds: [ids[2]!],
        tickDelta: 240,
        laneDelta: 1,
      }).rejections[0]?.code,
    ).toBe("not-movable");
    expect(marker.start).toBe(480);

    const pasted = makeMidi("DRUMS");
    const occupied = pasted.track.insertNote({
      tick: 480,
      pitch: 101,
      duration: 120,
    });
    const pasteSession = makeSession(
      pasted.midi,
      "DRUMS",
      Difficulty.Expert,
      "highway",
    );
    const paste = characterization.drums.paste;
    const result = pasteSession.execute({
      type: DomainCommandType.PasteChartNotes,
      anchorTick: paste.anchorTick,
      notes: [
        {
          relativeTick: 0,
          lane: -1,
          laneId: "kick",
          durationTicks: 1,
          velocity: 100,
          originalPitch: 96,
        },
        {
          relativeTick: 0,
          lane: -1,
          laneId: "kick",
          durationTicks: 1,
          velocity: 100,
          originalPitch: 95,
        },
        {
          relativeTick: 0,
          lane: 1,
          laneId: "yellow",
          padType: "cymbal",
          durationTicks: 1,
          velocity: 100,
          originalPitch: 101,
        },
        // Markers are not lane notes and are skipped by paste.
        {
          relativeTick: 0,
          lane: 8,
          laneId: "nope",
          durationTicks: 1,
          velocity: 100,
          originalPitch: 104,
        },
      ],
    });
    expect(result.rejections).toEqual([]);
    expect(
      pasted.track
        .getNotes()
        .filter(
          (note) =>
            note.start === paste.anchorTick && note.noteOn !== occupied.noteOn,
        )
        .map((note) => ({ pitch: note.pitch, tick: note.start })),
    ).toEqual(paste.expected);
  });

  it("replays vocal movement, lyric association, overlap, and deletion rules", () => {
    const { midi, track } = makeMidi("VOCALS");
    const pitched = track.insertNote({ tick: 0, pitch: 60, duration: 120 });
    track.addTextEvent(MetaType.Lyric, 0, "la");
    const percussion = track.insertNote({ tick: 0, pitch: 90, duration: 120 });
    const firstPhrase = track.insertNote({
      tick: 0,
      pitch: 116,
      duration: 100,
    });
    track.insertNote({ tick: 200, pitch: 116, duration: 100 });
    const session = makeSession(midi, "VOCALS", null, "piano-roll");
    const idForNoteOn = new Map(
      track
        .getNotes()
        .map((note) => [
          note.noteOn,
          formatNoteId(0, track.getEventId(note.noteOn)),
        ]),
    );
    const pitchedId = idForNoteOn.get(pitched.noteOn);
    const percussionId = idForNoteOn.get(percussion.noteOn);
    const phraseId = idForNoteOn.get(firstPhrase.noteOn);
    expect(pitchedId).toBeDefined();
    expect(percussionId).toBeDefined();
    expect(phraseId).toBeDefined();

    const move = session.execute({
      type: DomainCommandType.MoveVocalEntities,
      targetIds: [pitchedId!, percussionId!],
      tickDelta: characterization.vocal.pitchedMove.toTick,
      pitchDelta:
        characterization.vocal.pitchedMove.toPitch -
        characterization.vocal.pitchedMove.fromPitch,
    });
    expect(move.rejections).toEqual([]);
    expect(
      track.getNotes().find((note) => note.noteOn === pitched.noteOn)?.pitch,
    ).toBe(characterization.vocal.pitchedMove.clampedPitch);
    expect(
      track.getNotes().find((note) => note.noteOn === pitched.noteOn)?.start,
    ).toBe(characterization.vocal.pitchedMove.toTick);
    expect(
      track.getNotes().find((note) => note.noteOn === percussion.noteOn)?.pitch,
    ).toBe(characterization.vocal.nonPitchedMove.resultPitch);
    expect(
      track.getTextEvents().find((event) => event.text === "la")?.tick,
    ).toBe(characterization.vocal.lyricTicksAfterMove[0]);

    const phraseMove = session.execute({
      type: DomainCommandType.MoveVocalEntities,
      targetIds: [phraseId!],
      tickDelta: characterization.vocal.phraseMove.blockedDelta,
      pitchDelta: 0,
      previousValidTickDelta: characterization.vocal.phraseMove.firstStart,
    });
    expect(phraseMove.rejections).toEqual([]);
    expect(
      track.getNotes().find((note) => note.noteOn === firstPhrase.noteOn)
        ?.start,
    ).toBe(characterization.vocal.phraseMove.resultStart);
    const resize = session.execute({
      type: DomainCommandType.ResizeVocalEntities,
      targetIds: [phraseId!],
      durationDelta: 250,
    });
    expect(resize.rejections[0]?.code).toBe("rule:implicit.phraseSelfOverlap");

    const deleteResult = session.execute({
      type: GeneralCommandType.DeleteEntities,
      targetIds: [pitchedId!],
    });
    expect(deleteResult.rejections).toEqual([]);
    expect(
      track.getNotes().some((note) => note.noteOn === pitched.noteOn),
    ).toBe(false);
    expect(track.getTextEvents().some((event) => event.text === "la")).toBe(
      false,
    );
  });

  it("creates vocal notes with lyrics and rejects overlapping phrase creation", () => {
    const { midi, track } = makeMidi("VOCALS");
    track.insertNote({ tick: 200, pitch: 116, duration: 100 });
    const session = makeSession(midi, "VOCALS", null, "piano-roll");
    const note = session.execute({
      type: DomainCommandType.AddVocalNote,
      kind: VocalNoteKind.Pitched,
      tick: 480,
      endTick: 600,
      pitch: 60,
      lyric: characterization.vocal.pasteRestoresLyric,
    });
    expect(note.rejections).toEqual([]);
    expect(track.getTextEvents().map((event) => event.text)).toEqual(["la"]);
    expect(
      session.execute({
        type: DomainCommandType.CreateVocalPhrase,
        phraseKind: VocalPhraseKind.StagePower,
        startTick: 250,
        endTick: 400,
      }).rejections[0]?.code,
    ).toBe("rule:implicit.phraseSelfOverlap");
  });

  it("materializes the configured vocal track before writing its lyric", () => {
    const midi = new Midi();
    const global = new MidiTrack("GLOBAL");
    global.insertNote({ tick: 200, pitch: 116, duration: 100 });
    midi.tracks = [global];
    const session = makeSession(midi, "VOCALS", null, "piano-roll");
    const result = session.execute({
      type: DomainCommandType.AddVocalNote,
      kind: VocalNoteKind.Pitched,
      tick: 480,
      endTick: 600,
      pitch: 60,
      lyric: "hello",
    });
    expect(result.rejections).toEqual([]);
    const vocals = midi.tracks.find((track) => track.name === "VOCALS");
    expect(vocals?.getNotes()).toHaveLength(1);
    expect(
      vocals
        ?.getTextEvents()
        .filter((event) => event.type === MetaType.Lyric)
        .map((event) => event.text),
    ).toEqual(["hello"]);
    expect(
      global.getTextEvents().filter((event) => event.type === MetaType.Lyric),
    ).toEqual([]);
  });

  it("exposes vocal lane specifications from the views layer", () => {
    const { midi } = makeMidi("VOCALS");
    const session = makeSession(midi, "VOCALS", null, "piano-roll");
    const rows = session.getProjection().getRows();
    expect(rows.slice(-5).map((row) => row.id)).toEqual([
      "vocal-phrase",
      "power-window",
      "stagepower",
      "percussion",
      "pitchless",
    ]);
  });
});
