import { MetaType, Midi, type MidiTrack } from "@openchart/core";
import { SongView, validateVocalTrack } from "@openchart/views";
import { Vector2 } from "three";
import { describe, expect, it } from "vitest";
import { CoordinateSystem } from "../coordinates";
import { HeaderHeight, KeyboardWidth } from "../constants";
import { HeaderController } from "../header";
import { NoteDataStore } from "../noteData";
import { NoteEditingController } from "../editing/controller";
import { NoteGeometryCache } from "../noteGeometry";
import {
  DefaultProfile,
  pitchName,
  profileForInstrument,
  type PianoRollProfile,
} from "../profile";
import { SelectionContext } from "../selection";
import type {
  LyricPromptHandlers,
  PianoRollContext,
  PianoRollNote,
  VocalPlacement,
} from "../types";
import type { ChartViewState } from "../../AbstractChartView";

/** The vocals profile every test in this file edits with. */
const VOCALS = profileForInstrument("VOCALS");

/** Height of one pinned lane at the default vertical zoom. */
const LANE_HEIGHT = 18;
/** Screen Y where the pitch grid starts below the five pinned lanes. */
const GRID_TOP = HeaderHeight + 5 * LANE_HEIGHT;
/** A constant 120 BPM tempo map. */
const TEMPO = [{ tick: 0, microsecondsPerQuarterNote: 500_000 }];
/** Screen X of a tick at the default zoom (120 px per quarter = 480 ticks). */
const xAt = (tick: number) => KeyboardWidth + tick / 4;
/** Screen Y inside the grid row of a pitch, with camera.y = 84. */
const yAt = (pitch: number) => GRID_TOP + (84 - pitch) * 18 + 5;
/** Screen Y inside a pinned lane. */
const laneY = (index: number) =>
  HeaderHeight + index * LANE_HEIGHT + LANE_HEIGHT / 2;

/** Builds a coordinate system for a profile, camera pitch and viewport. */
function makeCoordinates(profile: PianoRollProfile, y = 84, height = 0) {
  return new CoordinateSystem(
    {
      getPpqn: () => 480,
      getTempoEvents: () => TEMPO,
      getState: () => ({ snap: { enabled: true, denominator: 4 } }) as never,
      getProfile: () => profile,
      getViewport: () => ({ height }),
    },
    { x: 0, y, h: 120, v: 18 },
  );
}

/**
 * Wires a real editing controller to a fake host that records transactions,
 * lyric prompts, previews and change notifications.
 */
function harness(midi = new Midi(), profile: PianoRollProfile = VOCALS) {
  const state: ChartViewState = {
    midi,
    selectedTrackKey: "vocals",
    selectedTrackIndex: null,
    selectedInstrument: "VOCALS",
    selectedDifficulty: 3,
    snap: { enabled: true, denominator: 4 },
    isPlaying: false,
    lockCursor: false,
  };
  const selection = new SelectionContext();
  const noteData = new NoteDataStore();
  const placement: VocalPlacement = { noteKind: "pitched", phrase: null };
  const calls = {
    begin: 0,
    end: 0,
    rollback: 0,
    changed: 0,
    previews: 0,
    rollbackHandled: true,
    prompts: [] as { tick: number; handlers: LyricPromptHandlers }[],
  };
  const coordinates = makeCoordinates(profile);
  const track = (): MidiTrack | null =>
    profile.trackName ? (midi.getTrack(profile.trackName) ?? null) : null;
  const trackIndex = () => {
    const found = track();
    return found ? midi.tracks.indexOf(found) : null;
  };
  const context = {
    getState: () => state,
    getMidi: () => midi,
    getPpqn: () => 480,
    getSelectedTrack: track,
    getSelectedTrackIndex: trackIndex,
    getProfile: () => profile,
    getVocalPlacement: () => placement,
    getVocalMarks: () => ({ missingLyric: new Set(), missingTicks: [] }),
    getTrackNotes: (m: Midi, index: number) => noteData.getTrackNotes(m, index),
    getCurrentNotes: () => noteData.currentNotes,
    getTempoEvents: () => TEMPO,
    getTimeSignatureEvents: () => [{ tick: 0, numerator: 4, denominator: 2 }],
    getTextEvents: () => track()?.getTextEvents() ?? [],
    getCamera: () => coordinates.getCamera(),
    getViewport: () => ({ width: 1000, height: 1000 }),
    getSelectionContext: () => selection,
    requestRender: () => {},
    beginEdit: () => calls.begin++,
    endEdit: () => calls.end++,
    notifyNotesChanged: () => calls.changed++,
    requestSeek: () => {},
    invalidateTempoCache: () => {},
    rollbackEdit: () => {
      calls.rollback++;
      return calls.rollbackHandled;
    },
    promptLyric: (tick: number, handlers: LyricPromptHandlers) =>
      calls.prompts.push({ tick, handlers }),
    cancelLyricPrompt: () => calls.prompts.pop()?.handlers.onCancel(),
    editNextLyric: () => {},
    previewNotes: () => calls.previews++,
  } as unknown as PianoRollContext;
  const editing = new NoteEditingController(context, coordinates);
  const notes = (): PianoRollNote[] => {
    const index = trackIndex();
    return index === null ? [] : noteData.getTrackNotes(midi, index);
  };
  const lyrics = () =>
    (track()?.getTextEvents() ?? [])
      .filter((event) => event.type === MetaType.Lyric)
      .map(({ tick, text }) => [tick, text]);
  const drag = (from: Vector2, toX: number) => {
    editing.beginCreate(from);
    editing.updateResize(new Vector2(toX, from.y));
    editing.finishGesture();
  };
  return {
    midi,
    editing,
    calls,
    placement,
    selection,
    coordinates,
    notes,
    lyrics,
    drag,
    track,
  };
}

/** A harness with two lyric notes ("one", "two") already on the track. */
function seeded() {
  const midi = new Midi();
  const vocals = new SongView(midi).getVocalTrackView("VOCALS")!;
  vocals.addPitched(60, 0, 240, "one");
  vocals.addPitched(62, 480, 720, "two");
  vocals.addPercussion(960, 1080);
  return harness(midi);
}

describe("piano-roll profiles", () => {
  it("derives the vocals profile from the instrument config", () => {
    expect(VOCALS.id).toBe("vocals");
    expect(VOCALS.pitchRange).toEqual({ low: 36, high: 84 });
    expect(VOCALS.pinnedLanes.map((lane) => lane.id)).toEqual([
      "vocal-phrase",
      "power-window",
      "stagepower",
      "percussion",
      "pitchless",
    ]);
    expect(profileForInstrument("LEAD GUITAR")).toBe(DefaultProfile);
    expect(VOCALS.classify(85)).toBe("pitchless");
    expect(VOCALS.classify(35)).toBe("pitchless");
    expect(VOCALS.classify(111)).toBe("phrase:power-window");
    expect(VOCALS.laneForPitch(35)?.id).toBe("pitchless");
    expect(VOCALS.laneForPitch(60)).toBeNull();
    expect([36, 60, 84].map(pitchName)).toEqual(["C2", "C4", "C6"]);
  });

  it("keeps the default grid identical: header origin and 0-127", () => {
    const coordinates = makeCoordinates(DefaultProfile, 127);
    expect(coordinates.getGridTop()).toBe(HeaderHeight);
    expect(coordinates.pitchAtScreenY(HeaderHeight)).toBe(127);
    expect(coordinates.pitchAtScreenY(100_000)).toBe(0);
    coordinates.pan(0, 10_000);
    expect(coordinates.getCamera().y).toBe(127);
    expect(coordinates.laneAtScreenY(HeaderHeight + 2)).toBeNull();
  });

  it("offsets the grid below the pinned lanes and clamps to C2-C6", () => {
    const coordinates = makeCoordinates(VOCALS);
    expect(coordinates.getGridTop()).toBe(GRID_TOP);
    expect(coordinates.pitchAtScreenY(yAt(60))).toBe(60);
    expect(coordinates.pitchAtScreenY(GRID_TOP - 50)).toBe(84);
    expect(coordinates.pitchAtScreenY(100_000)).toBe(36);
    coordinates.pan(0, 100_000);
    expect(coordinates.getCamera().y).toBe(84);
    coordinates.pan(0, -100_000);
    expect(coordinates.getCamera().y).toBe(36);
    coordinates.getCamera().y = 84;
    // Row tops are measured from gridTop, not the header.
    expect(coordinates.toScreenSpace(new Vector2(0, -60 * 18)).y).toBe(
      yAt(60) - 5,
    );

    expect(coordinates.laneAtScreenY(laneY(0))?.id).toBe("vocal-phrase");
    expect(coordinates.laneAtScreenY(laneY(4))?.id).toBe("pitchless");
    expect(coordinates.laneAtScreenY(GRID_TOP)).toBeNull();
    expect(coordinates.laneAtScreenY(HeaderHeight - 1)).toBeNull();
    expect(coordinates.pinnedRectForPitch(90)).toEqual({
      y: HeaderHeight + 3 * LANE_HEIGHT,
      height: LANE_HEIGHT,
    });

    coordinates.fitPitchRange(GRID_TOP + 49 * 10);
    expect(coordinates.getCamera()).toMatchObject({
      y: 84,
      v: (GRID_TOP + 49 * 10 - HeaderHeight) / 54,
    });
  });

  it("scales pinned lanes with the pitch rows", () => {
    const coordinates = makeCoordinates(VOCALS);
    coordinates.zoomVertical(2, 0);

    expect(coordinates.getGridTop()).toBe(HeaderHeight + 5 * LANE_HEIGHT * 2);
    expect(coordinates.laneRect(VOCALS.pinnedLanes[0])).toEqual({
      y: HeaderHeight,
      height: LANE_HEIGHT * 2,
    });
    expect(coordinates.laneRect(VOCALS.pinnedLanes[1]).y).toBe(
      HeaderHeight + LANE_HEIGHT * 2,
    );
    expect(
      coordinates.laneAtScreenY(
        HeaderHeight + 3 * LANE_HEIGHT * 2 + LANE_HEIGHT,
      )?.id,
    ).toBe("percussion");
  });

  it("keeps the lowest keyboard pitch at the bottom of the viewport", () => {
    const height = 1008;
    const coordinates = makeCoordinates(VOCALS, 84, height);

    coordinates.pan(0, 100_000);

    const camera = coordinates.getCamera();
    const lowestPitchBottom =
      coordinates.getGridTop() +
      (camera.y - VOCALS.pitchRange.low + 1) * camera.v;
    expect(camera.y).toBeGreaterThan(VOCALS.pitchRange.low);
    expect(lowestPitchBottom).toBeCloseTo(height);
    expect(coordinates.pitchAtScreenY(height)).toBe(VOCALS.pitchRange.low);
  });

  it("hit-tests lane notes at fixed Y and clips grid notes to the grid", () => {
    const coordinates = makeCoordinates(VOCALS);
    const cache = new NoteGeometryCache();
    const note = (pitch: number) =>
      ({
        tick: 0,
        durationTicks: 480,
        pitch,
        velocity: 100,
        midiNote: {},
      }) as PianoRollNote;
    const percussion = note(90);
    const pitched = note(84);
    const rebuild = () =>
      cache.rebuild({
        track: {} as MidiTrack,
        notes: [pitched, percussion],
        noteIndex: null,
        tempoEvents: TEMPO,
        tickWidth: 0.25,
        rowHeight: 18,
        width: 800,
        height: 800,
        noteHeight: 16,
        coordinates,
      });
    rebuild();
    expect(cache.hitTest(new Vector2(100, laneY(3)), coordinates)).toBe(
      percussion,
    );
    expect(cache.hitTest(new Vector2(100, yAt(84)), coordinates)).toBe(pitched);

    // Scroll so pitch 84 is above the grid: it must not be hit in the lanes,
    // while the percussion note stays put.
    coordinates.getCamera().y = 70;
    rebuild();
    expect(cache.hitTest(new Vector2(100, laneY(3)), coordinates)).toBe(
      percussion,
    );
    expect(cache.hitTest(new Vector2(100, laneY(1)), coordinates)).toBeNull();
  });

  it("does not create [section New] from the vocals header lane", () => {
    for (const [profile, expected] of [
      [DefaultProfile, 1],
      [VOCALS, 0],
    ] as const) {
      const midi = new Midi();
      const track = new SongView(midi).getVocalTrackView()!.ensureTrack()!;
      const header = new HeaderController(
        {
          getState: () => ({ isPlaying: false }),
          getMidi: () => midi,
          getSelectedTrack: () => track,
          getProfile: () => profile,
          getTempoEvents: () => TEMPO,
          getTimeSignatureEvents: () => [],
          getTextEvents: () => [],
          invalidateTempoCache: () => {},
          notifyNotesChanged: () => {},
          requestRender: () => {},
        } as never,
        makeCoordinates(profile),
      );
      header.click(new Vector2(300, HeaderHeight - 4));
      const markers = track
        .getTextEvents()
        .filter((event) => event.type === MetaType.Marker);
      expect(markers).toHaveLength(expected);
    }
  });
});

describe("vocal note editing", () => {
  it("creates the track and a pitched note, then commits its lyric in one transaction", () => {
    const h = harness();
    h.drag(new Vector2(xAt(0), yAt(60)), xAt(480));

    expect(h.track()).not.toBeNull();
    expect(h.notes().map((n) => [n.pitch, n.tick, n.durationTicks])).toEqual([
      [60, 0, 480],
    ]);
    expect(h.calls.prompts.map((p) => p.tick)).toEqual([0]);
    expect(h.editing.isAwaitingLyric).toBe(true);
    // The transaction is still open while the lyric prompt is up.
    expect([h.calls.begin, h.calls.end]).toEqual([1, 0]);
    expect(h.calls.previews).toBe(1);

    expect(h.calls.prompts[0].handlers.onCommit("   ")).toBe(false);
    expect(h.calls.prompts[0].handlers.onCommit("la")).toBe(true);
    expect([h.calls.begin, h.calls.end]).toEqual([1, 1]);
    expect(h.lyrics()).toEqual([[0, "la"]]);
    expect(validateVocalTrack(h.track(), VOCALS.vocal!)).toEqual([]);
  });

  it("rolls back the whole create on Escape", () => {
    const h = harness();
    h.drag(new Vector2(xAt(0), yAt(60)), xAt(480));
    h.calls.prompts[0].handlers.onCancel();
    expect(h.calls.rollback).toBe(1);
    // The rollback closes the transaction itself; no endEdit follows.
    expect(h.calls.end).toBe(0);
    expect(h.editing.isAwaitingLyric).toBe(false);
  });

  it("removes the note by hand when no history rollback is available", () => {
    const h = harness();
    h.calls.rollbackHandled = false;
    h.drag(new Vector2(xAt(0), yAt(60)), xAt(480));
    h.calls.prompts[0].handlers.onCancel();
    expect(h.notes()).toEqual([]);
    expect(h.lyrics()).toEqual([]);
    expect([h.calls.begin, h.calls.end]).toEqual([1, 1]);
  });

  it("rolls back a pending lyric when playback cancels the gesture", () => {
    const h = harness();
    h.drag(new Vector2(xAt(0), yAt(60)), xAt(480));
    h.editing.cancelGesture();
    expect(h.calls.rollback).toBe(1);
    expect(h.editing.isAwaitingLyric).toBe(false);
  });

  it("creates lane kinds by dragging in their lane, without a lyric prompt", () => {
    const h = harness();
    h.drag(new Vector2(xAt(0), laneY(3)), xAt(240));
    h.drag(new Vector2(xAt(480), laneY(4)), xAt(720));
    expect(h.notes().map((n) => n.pitch)).toEqual([90, 85]);
    // Percussion: no prompt. Pitchless: prompt.
    expect(h.calls.prompts.map((p) => p.tick)).toEqual([480]);
  });

  it("uses the toolbar kind and phrase mode in the grid", () => {
    const h = harness();
    h.placement.noteKind = "percussion";
    h.drag(new Vector2(xAt(0), yAt(60)), xAt(480));
    h.placement.phrase = "vocal";
    h.drag(new Vector2(xAt(0), yAt(60)), xAt(960));
    // An overlapping phrase of the same kind is rejected.
    h.drag(new Vector2(xAt(480), yAt(60)), xAt(1440));
    expect(h.notes().map((n) => [n.pitch, n.tick, n.durationTicks])).toEqual([
      [90, 0, 480],
      [96, 0, 960],
    ]);
    expect(h.calls.prompts).toEqual([]);
    expect(h.calls.begin).toBe(h.calls.end);
  });

  it("moves a note with its lyric and clamps it to the pitched range", () => {
    const h = seeded();
    const first = h.notes().find((n) => n.pitch === 60)!;
    h.editing.beginMove(first);
    h.editing.updateMove(new Vector2(xAt(1440) + 1, yAt(62)));
    h.editing.finishGesture();
    expect(h.lyrics()).toEqual([
      [480, "two"],
      [1440, "one"],
    ]);
    const moved = h.notes().find((n) => n.tick === 1440)!;
    expect(moved.pitch).toBe(62);

    // Dragging up into the lanes clamps at C6 instead of leaving the grid.
    h.editing.beginMove(moved);
    h.editing.updateMove(new Vector2(xAt(1440) + 1, laneY(2)));
    h.editing.finishGesture();
    expect(h.notes().find((n) => n.tick === 1440)!.pitch).toBe(84);
  });

  it("keeps lane notes in their lane when dragged vertically", () => {
    const h = seeded();
    const percussion = h.notes().find((n) => n.pitch === 90)!;
    h.editing.beginMove(percussion);
    h.editing.updateMove(new Vector2(xAt(1440) + 1, yAt(50)));
    h.editing.finishGesture();
    expect(h.notes().find((n) => n.tick === 1440)!.pitch).toBe(90);
  });

  it("transposes only pitched notes and deletes lyrics with notes", () => {
    const h = seeded();
    h.selection.notes = h.notes();
    h.editing.transposeSelection(30);
    expect(h.notes().map((n) => n.pitch)).toEqual([84, 84, 90]);

    h.selection.notes = h.notes().filter((n) => n.tick === 0);
    h.editing.deleteSelection();
    expect(h.lyrics()).toEqual([[480, "two"]]);
  });

  it("copies and pastes notes with their lyrics", () => {
    const h = seeded();
    h.selection.notes = h.notes();
    h.editing.copySelection();
    h.editing.pasteClipboard(xAt(1920));
    expect(h.lyrics()).toEqual([
      [0, "one"],
      [480, "two"],
      [1920, "one"],
      [2400, "two"],
    ]);
    expect(h.notes().filter((n) => n.pitch === 90)).toHaveLength(2);
    expect(validateVocalTrack(h.track(), VOCALS.vocal!)).toEqual([]);
  });
});
