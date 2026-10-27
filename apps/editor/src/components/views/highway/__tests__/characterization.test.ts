import {
  defaultConfig,
  Difficulty,
  formatNoteId,
  getPhrasePitch,
  getHighwaySustainEnd,
  getSustainCutOptions,
  getSustainCutTargets,
  type EditablePhraseKind,
  type SongViewConfig,
} from "@openchart/views";
import { describe, expect, it } from "vitest";
import characterization from "../../../../../../../packages/views/tests/fixtures/characterization/editing.json" with { type: "json" };
import { HighwayPhraseEditingController } from "../editing/phraseEditing";
import type { HighwayCoordinateSystem } from "../coordinates";
import type { HighwayPhrase } from "../hitTesting";
import { getHighwayDragTarget } from "../interactionMath";
import { getDrumNoteProfile, getDrumPitchForPlacement } from "../profile";
import {
  copyHighwaySelectionToClipboard,
  createHighwayTestSetup,
} from "./testUtils";

type NotePlacement = "normal" | "force-hopo" | "force-strum" | "tap";

describe("editing characterization: Highway", () => {
  it("records drum placement pitches for every difficulty, kind, and lane", () => {
    const { offsets, placements } = characterization.drums;
    const kinds = ["pad", "cymbal", "kick"] as const;

    offsets.forEach((offset, difficultyIndex) => {
      for (const kind of kinds) {
        for (let lane = 0; lane < 4; lane++) {
          expect(getDrumPitchForPlacement(kind, lane, offset)).toBe(
            placements[kind][difficultyIndex][lane],
          );
        }
      }
    });
  });

  it("records forced marker replacement and duplicate suppression by difficulty", () => {
    const { difficulties, placementOrder, expectedByPlacement, tick } =
      characterization.forcedMarkers;
    const markerTypes: NotePlacement[] = [
      "normal",
      "force-hopo",
      "force-strum",
      "tap",
    ];

    for (const [difficultyIndex, difficulty] of difficulties.entries()) {
      for (const placement of placementOrder as NotePlacement[]) {
        const difficultyName = ["easy", "medium", "hard", "expert"][
          difficultyIndex
        ]!;
        const config: SongViewConfig = {
          ...defaultConfig,
          tracks: defaultConfig.tracks.map((track) => {
            if (track.key !== "lead-guitar" || track.type !== "instrument") {
              return track;
            }
            return {
              ...track,
              charts: track.charts.map((chart) =>
                "difficulty" in chart && chart.difficulty === difficultyIndex
                  ? {
                      ...chart,
                      range: {
                        low: difficulty.offset,
                        high: difficulty.offset + chart.laneCount - 1,
                      },
                    }
                  : chart,
              ),
              notes: {
                ...track.notes,
                [`${difficultyName}Hopo`]: difficulty.markers[0]!,
                [`${difficultyName}Strum`]: difficulty.markers[1]!,
                [`${difficultyName}Tap`]: difficulty.markers[2]!,
              },
            };
          }),
        };
        const setup = createHighwayTestSetup(
          "lead-guitar",
          config,
          [
            Difficulty.Easy,
            Difficulty.Medium,
            Difficulty.Hard,
            Difficulty.Expert,
          ][difficultyIndex]!,
        );
        for (const pitch of difficulty.markers) {
          setup.midiTrack.insertNote({
            pitch,
            tick,
            velocity: 100,
            duration: 1,
          });
        }
        setup.setNotePlacementType(placement);

        setup.session.execute({
          type: "PLACE_CHART_NOTE",
          lane: 0,
          tick,
          placement,
          cutPolicy: "all",
        });
        setup.session.execute({
          type: "PLACE_CHART_NOTE",
          lane: 0,
          tick,
          placement,
          cutPolicy: "all",
        });

        const selectedMarkerIndex =
          expectedByPlacement[placement as keyof typeof expectedByPlacement][0];
        const expected =
          selectedMarkerIndex === undefined
            ? []
            : [difficulty.markers[selectedMarkerIndex]];
        const markerPitches = new Set(difficulty.markers);
        expect(
          setup.midiTrack
            .getNotes()
            .filter((note) => markerPitches.has(note.pitch))
            .map((note) => note.pitch)
            .sort((left, right) => left - right),
        ).toEqual(expected);
        expect(markerTypes).toContain(placement);
      }
    }
  });

  it("records sustain cut selection and extension behavior", () => {
    const { notes, tick, cutCases, end } = characterization.sustains;
    for (const testCase of cutCases) {
      const preferred = testCase.preferredPresent ? "preferred" : null;
      const actual = getSustainCutTargets(
        notes.map((note) => ({
          ...note,
          noteOn: note.id,
        })),
        tick,
        getSustainCutOptions(
          testCase.shiftKey,
          preferred,
          testCase.sameLanePlacement,
        ),
      ).map((note) => note.id);
      expect(actual).toEqual(testCase.expected);
    }
    expect(
      getHighwaySustainEnd(end.noteStart, end.pointerTick, end.nextStarts),
    ).toBe(end.withoutExtended);
    expect(
      getHighwaySustainEnd(end.noteStart, end.pointerTick, end.nextStarts, {
        extendPastNext: true,
      }),
    ).toBe(end.withExtended);
  });

  it("records snapped and clamped drags, drum kinds, Kick2, and immovable markers", () => {
    const { drums } = characterization;
    expect(
      getHighwayDragTarget(
        drums.move.initialTick,
        drums.move.initialLane,
        drums.move.tickDelta,
        drums.move.laneDelta,
        drums.move.snapTicks,
        true,
        drums.move.laneCount,
      ),
    ).toEqual(drums.move.expected);

    const setup = createHighwayTestSetup("drums");
    const kick2Pitch = drums.kick2.pitch;
    const cymbalPitch = drums.move.cymbalLane + 100;
    const markerPitch = 96 + drums.move.markerSlot;
    for (const pitch of [kick2Pitch, cymbalPitch, markerPitch]) {
      setup.midiTrack.insertNote({
        pitch,
        tick: drums.move.initialTick,
        velocity: 100,
        duration: 1,
      });
    }
    const entityId = (pitch: number) => {
      const note = setup.chart.getNotes().find((item) => item.pitch === pitch)!;
      return formatNoteId(
        setup.session.target.trackIndex!,
        setup.midiTrack.getEventId(note.noteOn),
      );
    };
    expect(getDrumNoteProfile(drums.kick2.pitch, 96)?.kind).toBe("kick");
    expect(
      setup.session.execute({
        type: "MOVE_CHART_NOTES",
        targetIds: [entityId(kick2Pitch)],
        tickDelta: 240,
        laneDelta: 3,
      }).changed,
    ).toBe(true);
    expect(
      setup.session.execute({
        type: "MOVE_CHART_NOTES",
        targetIds: [entityId(cymbalPitch)],
        tickDelta: 240,
        laneDelta: drums.move.cymbalTargetLane - drums.move.cymbalLane,
      }).changed,
    ).toBe(true);
    expect(
      setup.session.execute({
        type: "MOVE_CHART_NOTES",
        targetIds: [entityId(markerPitch)],
        tickDelta: 240,
        laneDelta: 0,
      }).changed,
    ).toBe(drums.move.markerMovable);
    expect(
      setup.chart
        .getNotes()
        .map((note) => note.pitch)
        .sort(),
    ).toEqual(
      [
        drums.kick2.movedPitch,
        drums.move.cymbalExpectedPitch,
        markerPitch,
      ].sort(),
    );
  });

  it("records drum chord paste with Kick2 preservation, marker clipping, and occupied-cell skip", () => {
    const { paste } = characterization.drums;
    const setup = createHighwayTestSetup("drums");
    for (const note of [...paste.source, ...paste.occupied]) {
      setup.midiTrack.insertNote({
        pitch: note.pitch,
        tick: note.tick,
        velocity: 100,
        duration: 1,
      });
    }
    const sourceIds = paste.source.map(({ pitch, tick }) => {
      const note = setup.midiTrack
        .getNotes()
        .find(
          (candidate) => candidate.pitch === pitch && candidate.start === tick,
        )!;
      return formatNoteId(
        setup.session.target.trackIndex!,
        setup.midiTrack.getEventId(note.noteOn),
      );
    });
    setup.session.selection.setSelectedIds(sourceIds);
    copyHighwaySelectionToClipboard(setup);
    expect(setup.session.pasteClipboard(paste.anchorTick).changed).toBe(true);

    expect(
      setup.chart
        .getNotes()
        .filter(
          (note) =>
            !paste.source.some(
              (sourceNote) =>
                sourceNote.pitch === note.pitch &&
                sourceNote.tick === note.start,
            ) &&
            !paste.occupied.some(
              (occupiedNote) =>
                occupiedNote.pitch === note.pitch &&
                occupiedNote.tick === note.start,
            ),
        )
        .map(({ pitch: note, start }) => ({ pitch: note, tick: start }))
        .sort((left, right) => left.pitch - right.pitch),
    ).toEqual(
      [...paste.expected].sort((left, right) => left.pitch - right.pitch),
    );
  });

  it("records phrase creation, movement, and edge clamps", () => {
    const setup = createHighwayTestSetup();
    const coordinates = {
      snapTick: (tick: number) => Math.round(tick / 240) * 240,
    } as HighwayCoordinateSystem;
    const editing = new HighwayPhraseEditingController(
      setup.context,
      coordinates,
    );
    const descriptor = setup.song
      .getTrackDescriptors()
      .find((track) => track.key === "lead-guitar")!;
    const getPhrase = (kind: EditablePhraseKind): HighwayPhrase => {
      const pitch = getPhrasePitch(descriptor, kind)!;
      const note = setup.midiTrack
        .getNotes()
        .find((candidate) => candidate.pitch === pitch)!;
      return {
        id: formatNoteId(
          setup.session.target.trackIndex!,
          setup.midiTrack.getEventId(note.noteOn),
        ),
        start: note.start,
        end: note.end,
        kind,
      };
    };

    const { create, move, resizeStart, resizeEnd } = characterization.phrases;
    editing.beginPhraseDrag(
      1,
      "stagepower",
      create.pointerTick,
      null,
      "create",
    );
    editing.updatePhraseDrag(create.dragTick);
    expect(editing.finishPhraseDrag()).toBe(true);
    let stagepower = getPhrase("stagepower");
    expect([stagepower.start, stagepower.end]).toEqual(create.expected);

    editing.beginPhraseDrag(1, "solo", 960, null, "create");
    editing.updatePhraseDrag(1200);
    expect(editing.finishPhraseDrag()).toBe(true);
    let solo = getPhrase("solo");
    const soloFixture = characterization.phrases.solo;
    expect([solo.start, solo.end]).toEqual(soloFixture.create.expected);

    editing.beginPhraseDrag(
      1,
      "solo",
      soloFixture.move.pointerTick,
      solo,
      "move",
    );
    editing.updatePhraseDrag(soloFixture.move.dragTick);
    expect(editing.finishPhraseDrag()).toBe(true);
    solo = getPhrase("solo");
    expect([solo.start, solo.end]).toEqual(soloFixture.move.expected);

    editing.beginPhraseDrag(
      1,
      "solo",
      soloFixture.resizeStart.pointerTick,
      { ...solo, ...soloFixture.move.expected },
      "resize-start",
    );
    editing.updatePhraseDrag(soloFixture.resizeStart.dragTick);
    expect(editing.finishPhraseDrag()).toBe(true);
    solo = getPhrase("solo");
    expect([solo.start, solo.end]).toEqual(soloFixture.resizeStart.expected);

    editing.beginPhraseDrag(
      1,
      "solo",
      soloFixture.resizeEnd.pointerTick,
      { ...solo, ...soloFixture.resizeStart.expected },
      "resize-end",
    );
    editing.updatePhraseDrag(soloFixture.resizeEnd.dragTick);
    expect(editing.finishPhraseDrag()).toBe(false);
    solo = getPhrase("solo");
    expect([solo.start, solo.end]).toEqual(soloFixture.resizeEnd.expected);

    stagepower = getPhrase("stagepower");
    editing.beginPhraseDrag(
      1,
      "stagepower",
      move.pointerTick,
      stagepower,
      "move",
    );
    editing.updatePhraseDrag(move.dragTick);
    expect(editing.finishPhraseDrag()).toBe(true);
    stagepower = getPhrase("stagepower");
    expect([stagepower.start, stagepower.end]).toEqual(move.expected);

    editing.beginPhraseDrag(
      1,
      "stagepower",
      resizeStart.pointerTick,
      { ...stagepower, ...move.expected },
      "resize-start",
    );
    editing.updatePhraseDrag(resizeStart.dragTick);
    expect(editing.finishPhraseDrag()).toBe(false);
    stagepower = getPhrase("stagepower");
    expect([stagepower.start, stagepower.end]).toEqual(resizeStart.expected);

    editing.beginPhraseDrag(
      1,
      "stagepower",
      resizeEnd.pointerTick,
      { ...stagepower, ...resizeStart.expected },
      "resize-end",
    );
    editing.updatePhraseDrag(resizeEnd.dragTick);
    expect(editing.finishPhraseDrag()).toBe(true);
    stagepower = getPhrase("stagepower");
    expect([stagepower.start, stagepower.end]).toEqual(resizeEnd.expected);
  });
});
