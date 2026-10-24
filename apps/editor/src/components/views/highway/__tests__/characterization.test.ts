import {
  Midi,
  MidiTrack,
  type MidiChannelEvent,
  type MidiNote,
} from "@openchart/midi";
import { Difficulty, SongView, type ChartView } from "@openchart/views";
import { describe, expect, it, vi } from "vitest";
import characterization from "../../../../../../../packages/views/tests/fixtures/characterization/editing.json" with { type: "json" };
import type { HighwayContext } from "../context";
import { HighwayNoteEditingController } from "../editing/noteEditing";
import { HighwayPhraseEditingController } from "../editing/phraseEditing";
import {
  getHighwayDragTarget,
  getHighwaySustainEnd,
  getSustainCutTargets,
} from "../interaction";
import { getDrumNoteProfile, getDrumPitchForPlacement } from "../profile";
import { SelectionContext } from "../selection";
import type { HighwayNotePlacementType } from "../types";

function makeNote(pitch: number, start: number, end: number): MidiNote {
  return {
    note: pitch,
    start,
    end,
    velocity: 100,
    noteOn: {} as MidiChannelEvent,
    noteOff: {} as MidiChannelEvent,
  } as MidiNote;
}

function addNoteAt(track: MidiTrack, pitch: number, tick: number): void {
  const insertAt = track.getInsertionIndexAt(tick);
  const previousTick = track.getAbsoluteTickAt(insertAt);
  track.addNote(pitch, tick - previousTick, 100, 1, insertAt);
}

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
    const markerTypes: HighwayNotePlacementType[] = [
      "normal",
      "force-hopo",
      "force-strum",
      "tap",
    ];

    for (const [difficultyIndex, difficulty] of difficulties.entries()) {
      for (const placement of placementOrder) {
        const track = new MidiTrack("LEAD GUITAR");
        for (const pitch of difficulty.markers) addNoteAt(track, pitch, tick);
        const configNotes = {
          [`${["easy", "medium", "hard", "expert"][difficultyIndex]}Hopo`]:
            difficulty.markers[0],
          [`${["easy", "medium", "hard", "expert"][difficultyIndex]}Strum`]:
            difficulty.markers[1],
          [`${["easy", "medium", "hard", "expert"][difficultyIndex]}Tap`]:
            difficulty.markers[2],
        };
        const chart = {
          getTrack: () => ({
            getKey: () => "lead-guitar",
            getMidiTrack: () => track,
          }),
          getSong: () => ({
            getTrackDescriptors: () => [
              {
                key: "lead-guitar",
                config: {
                  type: "instrument",
                  offsets: {
                    [["easy", "medium", "hard", "expert"][difficultyIndex]]:
                      difficulty.offset,
                  },
                  notes: configNotes,
                },
              },
            ],
          }),
          getOffset: () => difficulty.offset,
          getNotes: () => [],
          addNote: () => true,
        } as unknown as ChartView;
        const context = {
          getNotePlacementType: () => placement,
        } as unknown as HighwayContext;
        const editing = new HighwayNoteEditingController(context);

        editing.placeNoteAt(chart, 0, tick, false);
        editing.placeNoteAt(chart, 0, tick, false);

        const selectedMarkerIndex =
          expectedByPlacement[placement as keyof typeof expectedByPlacement][0];
        const expected =
          selectedMarkerIndex === undefined
            ? []
            : [difficulty.markers[selectedMarkerIndex]];
        expect(
          track
            .getNotes()
            .map((note) => note.note)
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
        testCase.shiftKey,
        preferred,
        testCase.sameLanePlacement,
      ).map((note) => note.id);
      expect(actual).toEqual(testCase.expected);
    }
    expect(
      getHighwaySustainEnd(end.noteStart, end.pointerTick, end.nextStarts),
    ).toBe(end.withoutExtended);
    expect(
      getHighwaySustainEnd(
        end.noteStart,
        end.pointerTick,
        end.nextStarts,
        true,
      ),
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

    const kick2 = makeNote(
      drums.kick2.pitch,
      drums.move.initialTick,
      drums.move.initialTick + 1,
    );
    const cymbal = makeNote(
      drums.move.cymbalLane + 100,
      drums.move.initialTick,
      drums.move.initialTick + 1,
    );
    const marker = makeNote(
      96 + drums.move.markerSlot,
      drums.move.initialTick,
      drums.move.initialTick + 1,
    );
    const pitches: number[] = [];
    const track = {
      setNotePitch: (_note: MidiNote, pitch: number) => {
        pitches.push(pitch);
        return true;
      },
      setNoteStart: () => true,
    };
    const chart = {
      getTrack: () => ({
        getKey: () => "drums",
        getMidiTrack: () => track,
      }),
      getSong: () => ({ attachTrack: vi.fn() }),
      getOffset: () => 96,
    } as unknown as ChartView;
    const editing = new HighwayNoteEditingController({} as HighwayContext);

    expect(getDrumNoteProfile(drums.kick2.pitch, 96)?.kind).toBe("kick");
    expect(editing.moveNote(chart, kick2, 3, 720)).toBe(true);
    expect(
      editing.moveNote(chart, cymbal, drums.move.cymbalTargetLane, 720),
    ).toBe(true);
    expect(editing.moveNote(chart, marker, 0, 720)).toBe(
      drums.move.markerMovable,
    );
    expect(pitches).toEqual([
      drums.kick2.movedPitch,
      drums.move.cymbalExpectedPitch,
    ]);
  });

  it("records drum chord paste with Kick2 preservation, marker clipping, and occupied-cell skip", () => {
    const { paste } = characterization.drums;
    const source = paste.source.map(({ pitch, tick }) =>
      makeNote(pitch, tick, tick + 1),
    );
    const occupied = paste.occupied.map(({ pitch, tick }) =>
      makeNote(pitch, tick, tick + 1),
    );
    const added: MidiNote[] = [];
    const notes = () => [...source, ...occupied, ...added];
    const chart = {
      getTrack: () => ({ getKey: () => "drums" }),
      getOffset: () => 96,
      getLaneCount: () => 9,
      getNotes: notes,
      addNoteAtPitch: (pitch: number, start: number, end: number) => {
        added.push(makeNote(pitch, start, end));
        return true;
      },
    } as unknown as ChartView;
    const selection = new SelectionContext();
    source.forEach((note) => selection.add(note.noteOn));
    const context = {
      getCurrentChart: () => chart,
      getSelectionContext: () => selection,
      getState: () => ({ isPlaying: false }),
      notifyNotesChanged: vi.fn(),
      requestRender: vi.fn(),
    } as unknown as HighwayContext;
    const editing = new HighwayNoteEditingController(context);

    editing.copySelection();
    editing.pasteClipboard(paste.anchorTick);

    expect(
      added.map(({ note, start }) => ({ pitch: note, tick: start })),
    ).toEqual(paste.expected);
  });

  it("records phrase creation, movement, and edge clamps", () => {
    const midi = new Midi();
    const song = new SongView(midi);
    const chart = song
      .getInstrumentTrackView("lead-guitar")
      ?.getChart(Difficulty.Expert);
    expect(chart).toBeDefined();
    const context = {
      getCurrentChart: () => chart,
      beginEdit: vi.fn(),
      endEdit: vi.fn(),
      notifyNotesChanged: vi.fn(),
    } as unknown as HighwayContext;
    const coordinates = {
      snapTick: (tick: number) => Math.round(tick / 240) * 240,
    } as unknown as ConstructorParameters<
      typeof HighwayPhraseEditingController
    >[1];
    const editing = new HighwayPhraseEditingController(context, coordinates);

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
    const track = midi.getTrack("LEAD GUITAR")!;
    const stagepower = track.getNotes({ pitch: { low: 116, high: 117 } })[0];
    expect([stagepower.start, stagepower.end]).toEqual(create.expected);

    editing.beginPhraseDrag(1, "solo", 960, null, "create");
    editing.updatePhraseDrag(1200);
    expect(editing.finishPhraseDrag()).toBe(true);
    const solo = track.getNotes({ pitch: { low: 118, high: 119 } })[0];
    const soloFixture = characterization.phrases.solo;
    expect([solo.start, solo.end]).toEqual(soloFixture.create.expected);

    editing.beginPhraseDrag(
      1,
      "solo",
      soloFixture.move.pointerTick,
      { start: solo.start, end: solo.end, kind: "solo", note: solo },
      "move",
    );
    editing.updatePhraseDrag(soloFixture.move.dragTick);
    expect(editing.finishPhraseDrag()).toBe(true);
    expect([solo.start, solo.end]).toEqual(soloFixture.move.expected);

    editing.beginPhraseDrag(
      1,
      "solo",
      soloFixture.resizeStart.pointerTick,
      { start: solo.start, end: solo.end, kind: "solo", note: solo },
      "resize-start",
    );
    editing.updatePhraseDrag(soloFixture.resizeStart.dragTick);
    editing.finishPhraseDrag();
    expect([solo.start, solo.end]).toEqual(soloFixture.resizeStart.expected);

    editing.beginPhraseDrag(
      1,
      "solo",
      soloFixture.resizeEnd.pointerTick,
      { start: solo.start, end: solo.end, kind: "solo", note: solo },
      "resize-end",
    );
    editing.updatePhraseDrag(soloFixture.resizeEnd.dragTick);
    editing.finishPhraseDrag();
    expect([solo.start, solo.end]).toEqual(soloFixture.resizeEnd.expected);

    editing.beginPhraseDrag(
      1,
      "stagepower",
      move.pointerTick,
      {
        start: stagepower.start,
        end: stagepower.end,
        kind: "stagepower",
        note: stagepower,
      },
      "move",
    );
    editing.updatePhraseDrag(move.dragTick);
    expect(editing.finishPhraseDrag()).toBe(true);
    expect([stagepower.start, stagepower.end]).toEqual(move.expected);

    editing.beginPhraseDrag(
      1,
      "stagepower",
      resizeStart.pointerTick,
      {
        start: stagepower.start,
        end: stagepower.end,
        kind: "stagepower",
        note: stagepower,
      },
      "resize-start",
    );
    editing.updatePhraseDrag(resizeStart.dragTick);
    editing.finishPhraseDrag();
    expect([stagepower.start, stagepower.end]).toEqual(resizeStart.expected);

    editing.beginPhraseDrag(
      1,
      "stagepower",
      resizeEnd.pointerTick,
      {
        start: stagepower.start,
        end: stagepower.end,
        kind: "stagepower",
        note: stagepower,
      },
      "resize-end",
    );
    editing.updatePhraseDrag(resizeEnd.dragTick);
    editing.finishPhraseDrag();
    expect([stagepower.start, stagepower.end]).toEqual(resizeEnd.expected);
  });
});
