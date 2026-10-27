import { MetaType, Midi, MidiTrack } from "@openchart/midi";
import { describe, expect, it } from "vitest";
import characterization from "../fixtures/characterization/editing.json" with { type: "json" };
import {
  createDefaultModeRegistry,
  createStandaloneEditing,
  defaultConfig,
  describeTrack,
  Difficulty,
  formatNoteId,
  getDifficultyName,
  getDifficultyNotePitch,
  getDrumPitchForPlacement,
  getPhrasePitch,
  type EditingSession,
  type SongViewConfig,
} from "../../src/index.js";

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
  config: SongViewConfig = defaultConfig,
): EditingSession {
  const descriptor = config.tracks
    .map(describeTrack)
    .find((track) => track.name === trackName)!;
  const trackIndex = midi.tracks.findIndex((track) => track.name === trackName);
  return createStandaloneEditing(midi, config).createSession(
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

function placeFretsMarker(
  placement: "normal" | "force-hopo" | "force-strum" | "tap",
  difficulty: Difficulty,
  existingMarkers: readonly number[] = [],
) {
  const { midi, track } = makeMidi("LEAD GUITAR");
  for (const pitch of existingMarkers) {
    track.insertNote({ tick: 480, pitch, duration: 1 });
  }
  const session = makeSession(midi, "LEAD GUITAR", difficulty, "highway");
  const result = session.execute({
    type: "PLACE_CHART_NOTE",
    lane: 0,
    tick: 480,
    placement,
    cutPolicy: "none",
  });
  return { track, result };
}

describe("default editing modes", () => {
  it("resolves every configured track against both editing hosts", () => {
    const registry = createDefaultModeRegistry();
    const expected = (trackName: string, host: string) => {
      if (trackName === "VOCALS")
        return host === "piano-roll" ? "vocals" : null;
      if (trackName === "DRUMS")
        return host === "highway" ? "chart.drums" : "midi.raw";
      if (
        trackName === "LEAD GUITAR" ||
        trackName === "RHYTHM GUITAR" ||
        trackName === "FOUR PAD" ||
        trackName === "FIVE PAD"
      ) {
        return host === "highway" ? "chart.frets" : "midi.raw";
      }
      return null;
    };

    for (const track of defaultConfig.tracks.map(describeTrack)) {
      for (const host of ["piano-roll", "highway"]) {
        expect(registry.resolve(track, host)?.id ?? null).toBe(
          expected(track.name, host),
        );
        expect(registry.canHost(track, host)).toBe(
          expected(track.name, host) !== null,
        );
      }
    }
    expect(registry.listForHost("highway").map((mode) => mode.id)).toEqual([
      "chart.drums",
      "chart.frets",
    ]);
  });

  it("uses configured role and note pitches for frets and drum layouts", () => {
    const lead = defaultConfig.tracks
      .map(describeTrack)
      .find((track) => track.name === "LEAD GUITAR")!;
    const drums = defaultConfig.tracks
      .map(describeTrack)
      .find((track) => track.name === "DRUMS")!;
    expect(getDifficultyName(Difficulty.Expert)).toBe("expert");
    expect(getDifficultyNotePitch(lead, Difficulty.Expert, "Hopo")).toBe(101);

    difficultyValues.forEach((difficulty, index) => {
      const offset = characterization.drums.offsets[index]!;
      const pitch = getDifficultyNotePitch(drums, difficulty, "Kick");
      expect(pitch).toBe(offset);
      for (const kind of ["pad", "cymbal", "kick"] as const) {
        for (let lane = 0; lane < 4; lane++) {
          expect(getDrumPitchForPlacement(kind, lane, offset)).toBe(
            characterization.drums.placements[kind][index]![lane],
          );
        }
      }
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
            type: "PLACE_CHART_NOTE",
            lane,
            tick: 480,
            drumKind: kind,
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
      type: "CREATE_PHRASE",
      phraseKind: "stagepower",
      startTick: 960,
      endTick: 1200,
    });
    expect(created.rejections).toEqual([]);
    const phrase = track
      .getNotes()
      .find((candidate) => candidate.pitch === 116)!;
    const phraseId = formatNoteId(0, track.getEventId(phrase.noteOn));
    const updated = session.execute({
      type: "UPDATE_PHRASE",
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
      const pitch = getPhrasePitch(
        describeTrack(
          defaultConfig.tracks.find((config) => config.name === "LEAD GUITAR")!,
        ),
        kind,
      )!;
      const created = session.execute({
        type: "CREATE_PHRASE",
        phraseKind: kind,
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
          type: "UPDATE_PHRASE",
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

  it("rejects forced-marker placement when its difficulty key is missing", () => {
    const config = structuredClone(defaultConfig);
    const lead = config.tracks.find((track) => track.name === "LEAD GUITAR")!;
    if (lead.type !== "instrument")
      throw new Error("Expected an instrument config");
    delete lead.notes.expertHopo;
    const { midi, track } = makeMidi("LEAD GUITAR");
    const session = makeSession(
      midi,
      "LEAD GUITAR",
      Difficulty.Expert,
      "highway",
      config,
    );
    const before = midi.toBuffer();
    const result = session.execute({
      type: "PLACE_CHART_NOTE",
      lane: 0,
      tick: 480,
      placement: "force-hopo",
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
      type: "MOVE_CHART_NOTES",
      targetIds: [formatNoteId(0, track.getEventId(note.noteOn))],
      tickDelta: -960,
      laneDelta: 99,
    });
    expect(result.rejections).toEqual([]);
    expect(track.getNotes()[0]).toMatchObject({ start: 0, pitch: 100 });
  });

  it("replays forced-marker replacement and duplicate suppression through chart.frets", () => {
    const { difficulties, placementOrder, expectedByPlacement } =
      characterization.forcedMarkers;
    const placements = placementOrder;
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

  it("replays sustain cut policies and end clamping through chart.frets", () => {
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
      for (const item of fixture.notes) {
        track.insertNote({
          tick: item.start,
          pitch: 96,
          duration: item.end - item.start,
        });
      }
      const session = makeSession(
        midi,
        "LEAD GUITAR",
        Difficulty.Expert,
        "highway",
      );
      const ids = track.getNotes().map((_, index) => noteId(track, 0, index));
      const preferredSustainId = testCase.preferredPresent ? ids[0] : undefined;
      const result = session.execute({
        type: "CUT_SUSTAINS",
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
        type: "SET_SUSTAIN_END",
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
        type: "MOVE_CHART_NOTES",
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
        type: "MOVE_CHART_NOTES",
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
        type: "MOVE_CHART_NOTES",
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
      type: "PASTE_CHART_NOTES",
      anchorTick: paste.anchorTick,
      notes: [
        {
          relativeTick: 0,
          lane: 0,
          durationTicks: 1,
          velocity: 100,
          drumKind: "kick",
          originalPitch: 96,
        },
        {
          relativeTick: 0,
          lane: 0,
          durationTicks: 1,
          velocity: 100,
          drumKind: "kick",
          originalPitch: 95,
        },
        {
          relativeTick: 0,
          lane: 1,
          durationTicks: 1,
          velocity: 100,
          drumKind: "cymbal",
          originalPitch: 101,
        },
        {
          relativeTick: 0,
          lane: 8,
          durationTicks: 1,
          velocity: 100,
          drumKind: "marker",
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
      type: "MOVE_VOCAL_ENTITIES",
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
      type: "MOVE_VOCAL_ENTITIES",
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
      type: "RESIZE_VOCAL_ENTITIES",
      targetIds: [phraseId!],
      durationDelta: 250,
    });
    expect(resize.rejections[0]?.code).toBe("phrase-overlap");

    const deleteResult = session.execute({
      type: "DELETE_ENTITIES",
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
      type: "ADD_VOCAL_NOTE",
      kind: "pitched",
      tick: 480,
      endTick: 600,
      pitch: 60,
      lyric: characterization.vocal.pasteRestoresLyric,
    });
    expect(note.rejections).toEqual([]);
    expect(track.getTextEvents().map((event) => event.text)).toEqual(["la"]);
    expect(
      session.execute({
        type: "CREATE_VOCAL_PHRASE",
        phraseKind: "stagepower",
        startTick: 250,
        endTick: 400,
      }).rejections[0]?.code,
    ).toBe("phrase-overlap");
  });

  it("materializes the configured vocal track before writing its lyric", () => {
    const midi = new Midi();
    const global = new MidiTrack("GLOBAL");
    global.insertNote({ tick: 200, pitch: 116, duration: 100 });
    midi.tracks = [global];
    const session = makeSession(midi, "VOCALS", null, "piano-roll");
    const result = session.execute({
      type: "ADD_VOCAL_NOTE",
      kind: "pitched",
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
    const vocalConfig = defaultConfig.tracks.find(
      (track) => track.name === "VOCALS",
    )!;
    const descriptor = describeTrack(vocalConfig);
    expect(descriptor.config.type).toBe("instrument");
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
