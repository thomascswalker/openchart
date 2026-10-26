import { MetaType, Midi, MidiTrack, type TempoEvent } from "@openchart/midi";
import {
  createStandaloneEditing,
  Difficulty,
  parseEntityId,
  SongView,
  validateVocalTrack,
} from "@openchart/views";
import { Vector2 } from "three";
import { describe, expect, it } from "vitest";
import { CoordinateSystem } from "../coordinates";
import { HeaderHeight, KeyboardWidth } from "../constants";
import { HeaderController } from "../controllers/header";
import { NoteDataStore } from "../noteData";
import { NoteEditingController } from "../controllers/noteEditing";
import { NoteGeometryCache } from "../rendering/geometry";
import {
  GENERIC_PROFILE,
  pitchName,
  profileFromSession,
  type PianoRollProfile,
} from "../profile";
import { SelectionContext } from "../selection";
import type {
  PianoRollLyricPromptHandlers,
  PianoRollContext,
  PianoRollNote,
  PianoRollVocalPlacement,
} from "../types";
import { toPianoRollNote } from "../noteData";
import type { PreviewState } from "@openchart/views";

const profileMidi = new Midi();
profileMidi.addTrack();
const profileEditing = createStandaloneEditing(profileMidi);
const vocalDescriptor = new SongView(profileMidi)
  .getTrackDescriptors()
  .find((descriptor) => descriptor.name === "VOCALS");
if (!vocalDescriptor) throw new Error("Default config is missing vocals");
const VOCALS = profileFromSession(
  profileEditing.createSession(
    {
      trackKey: vocalDescriptor.key,
      trackIndex: null,
      difficulty: Difficulty.Expert,
    },
    "piano-roll",
  ),
);
const LANE_HEIGHT = 18;
const GRID_TOP = HeaderHeight + 5 * LANE_HEIGHT;
const TEMPO: TempoEvent[] = [
  {
    deltaTime: 0,
    status: 0xff,
    type: MetaType.Tempo,
    length: 3,
    tick: 0,
    microsecondsPerQuarterNote: 500_000,
  },
];
/** Screen X of a tick at the default zoom (120 px per quarter = 480 ticks). */
const xAt = (tick: number) => KeyboardWidth + tick / 4;
/** Screen Y inside the grid row of a pitch, with camera.y = 84. */
const yAt = (pitch: number) => GRID_TOP + (84 - pitch) * 18 + 5;
/** Screen Y inside a pinned lane. */
const laneY = (index: number) =>
  HeaderHeight + index * LANE_HEIGHT + LANE_HEIGHT / 2;

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

function harness(
  midi = new Midi(),
  profile: PianoRollProfile = VOCALS,
  selectedInstrument = "VOCALS",
  selectedTrackIndex: number | null = null,
) {
  if (midi.trackCount === 0) midi.addTrack();
  const targetTrack =
    selectedTrackIndex === null
      ? midi.getTrack(selectedInstrument)
      : midi.tracks[selectedTrackIndex];
  const targetName = targetTrack?.name ?? selectedInstrument;
  const descriptor = new SongView(midi)
    .getTrackDescriptors()
    .find((item) => item.name === targetName);
  const standalone = createStandaloneEditing(midi);
  const session = standalone.createSession(
    {
      trackKey: descriptor?.key ?? targetName,
      trackIndex:
        selectedTrackIndex ??
        (targetTrack ? midi.tracks.indexOf(targetTrack) : null),
      difficulty: Difficulty.Expert,
    },
    "piano-roll",
  );
  const activeProfile = profileFromSession(session);
  if (activeProfile.id !== profile.id) {
    throw new Error(
      `Expected ${profile.id} session, received ${activeProfile.id}`,
    );
  }
  const state = {
    midi,
    selectedTrackIndex,
    selectedInstrument,
    selectedDifficulty: 3,
    snap: { enabled: true, denominator: 4 },
    isPlaying: false,
  };
  const selection = new SelectionContext();
  const noteData = new NoteDataStore();
  const placement: PianoRollVocalPlacement = {
    noteKind: "pitched",
    phrase: null,
  };
  const calls = {
    previews: 0,
    prompts: [] as { tick: number; handlers: PianoRollLyricPromptHandlers }[],
  };
  const coordinates = makeCoordinates(activeProfile);
  const track = (): MidiTrack | null => {
    const index = session.target.trackIndex ?? state.selectedTrackIndex;
    if (index !== null) {
      return midi.tracks[index] ?? null;
    }
    return midi.getTrack(state.selectedInstrument) ?? null;
  };
  const trackIndex = () => {
    const found = track();
    return found ? midi.tracks.indexOf(found) : null;
  };
  let previewState: PreviewState | null = null;
  const getDisplayNotes = (source: PianoRollNote[]): PianoRollNote[] => {
    if (!previewState) return source;
    const index = trackIndex();
    if (index === null) return source;
    return source
      .filter((note) => !previewState!.removed.has(note.id))
      .map((note) => {
        const updated = previewState!.updated.get(note.id);
        return updated
          ? {
              ...note,
              tick: updated.tick,
              pitch: updated.pitch,
              durationTicks: updated.duration,
              velocity: updated.velocity,
            }
          : note;
      })
      .concat(
        previewState.added
          .filter((note) => note.trackIndex === index)
          .map((note) => ({
            id: note.id,
            tick: note.tick,
            durationTicks: note.duration,
            pitch: note.pitch,
            velocity: note.velocity,
            midiNote: null,
          })),
      )
      .sort((left, right) => left.tick - right.tick);
  };
  const context = {
    getState: () => state,
    getMidi: () => midi,
    getPpqn: () => 480,
    getSelectedTrack: track,
    getSelectedTrackIndex: trackIndex,
    getProfile: () => activeProfile,
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
    getEditingSession: () => session,
    getPreviewState: () => previewState,
    setPreviewState: (preview: PreviewState | null) => {
      previewState = preview;
    },
    getDisplayNotes,
    requestRender: () => {},
    requestSeek: () => {},
    invalidateTempoCache: () => {},
    promptLyric: (tick: number, handlers: PianoRollLyricPromptHandlers) =>
      calls.prompts.push({ tick, handlers }),
    cancelLyricPrompt: () => calls.prompts.pop()?.handlers.onCancel(),
    editNextLyric: () => {},
    previewNotes: () => calls.previews++,
  } as unknown as PianoRollContext;
  selection.bindSharedSelection(standalone.selection, (id) => {
    const parsed = parseEntityId(id);
    if (!parsed || parsed.kind !== "note" || parsed.trackIndex === null) {
      return null;
    }
    const track = midi.tracks[parsed.trackIndex];
    const note = track?.getNoteByEventId(parsed.eventId);
    return track && note
      ? toPianoRollNote(track, parsed.trackIndex, note)
      : null;
  });
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
    session,
    standalone,
    editing,
    calls,
    placement,
    selection,
    state,
    coordinates,
    notes,
    lyrics,
    drag,
    track,
    context,
  };
}

function seeded() {
  const midi = new Midi();
  const vocals = new SongView(midi).getVocalTrackView("VOCALS")!;
  vocals.addPitched(60, 0, 240, "one");
  vocals.addPitched(62, 480, 720, "two");
  vocals.addPercussion(960, 1080);
  return harness(midi);
}

function copySelectionToClipboard(h: ReturnType<typeof harness>) {
  const track = h.track();
  const trackIndex = track ? h.midi.tracks.indexOf(track) : -1;
  if (!track || trackIndex < 0 || h.selection.notes.length === 0) {
    throw new Error(
      "Clipboard test selection must contain notes on the target track",
    );
  }

  const selected = h.selection.notes.map((note) => {
    const snapshot = {
      id: note.id,
      trackIndex,
      tick: note.tick,
      pitch: note.pitch,
      duration: note.durationTicks,
      velocity: note.velocity,
    };
    const classification = h.session.classifyNote(snapshot);
    const lyric = track
      .getTextEvents()
      .find(
        (event) => event.type === MetaType.Lyric && event.tick === note.tick,
      )?.text;
    return { note, snapshot, classification, lyric };
  });
  const firstTick = Math.min(...selected.map(({ note }) => note.tick));
  h.session.clipboard.setData({
    sourceModeId: h.session.mode.id,
    entities: selected.map(({ note, snapshot, classification, lyric }) => {
      const row = h.session.getProjection().rowForNote(snapshot);
      return {
        relativeTick: note.tick - firstTick,
        duration: note.durationTicks,
        velocity: note.velocity,
        pitch: note.pitch,
        ...(row ? { row: row.id } : {}),
        classification,
        ...(h.session.mode.id === "vocals" && lyric !== undefined
          ? { lyric }
          : {}),
      };
    }),
  });
}

describe("piano-roll profiles", () => {
  it("previews generic note drags in the session and commits one history entry on release", () => {
    const midi = new Midi();
    const trackIndex = midi.addTrack();
    const track = midi.tracks[trackIndex]!;
    track.name = "LEAD GUITAR";
    track.addNote(60, 0, 100, 120);
    const h = harness(midi, GENERIC_PROFILE, "LEAD GUITAR", trackIndex);
    const note = h.notes()[0]!;

    h.editing.beginMove(note);
    const targetY = h.coordinates.getGridTop() + (84 - 62) * 18 + 5;
    h.editing.updateMove(new Vector2(xAt(480), targetY));

    expect(track.getNotes()[0]).toMatchObject({ start: 0, note: 60 });
    const preview = h.context.getDisplayNotes!(h.notes())[0]!;
    expect(preview).toMatchObject({
      tick: 480,
      pitch: 62,
    });
    expect(h.selection.isSelected(preview)).toBe(true);

    h.editing.finishGesture();

    expect(track.getNotes()[0]).toMatchObject({ start: 480, note: 62 });
    expect(h.standalone.history.undoDepth).toBe(1);
    expect(h.standalone.history.isInTransaction).toBe(false);
  });

  it("uses the shared clipboard and edit commands for generic notes", () => {
    const midi = new Midi();
    const track = midi.tracks[midi.addTrack()]!;
    track.name = "LEAD GUITAR";
    const { noteOn } = track.addNote(60, 0, 90, 120);
    const h = harness(
      midi,
      GENERIC_PROFILE,
      "LEAD GUITAR",
      midi.tracks.indexOf(track),
    );
    h.selection.notes = [h.notes()[0]!];

    copySelectionToClipboard(h);
    expect(h.session.clipboard.canPaste()).toBe(true);

    h.session.execute({
      type: "DELETE_ENTITIES",
      targetIds: h.selection.notes.map((note) => note.id),
    });
    expect(track.getNotes()).toHaveLength(0);

    h.session.pasteClipboard(480);
    expect(track.getNotes()).toMatchObject([
      { note: 60, start: 480, end: 600, velocity: 90 },
    ]);
    expect(h.selection.notes[0]?.midiNote?.noteOn).not.toBe(noteOn);
  });

  it("derives the vocals profile from the editing session projection", () => {
    expect(VOCALS.id).toBe("vocals");
    expect(VOCALS.pitchRange).toEqual({ low: 36, high: 84 });
    expect(VOCALS.pinnedLanes.map((lane) => lane.id)).toEqual([
      "vocal-phrase",
      "power-window",
      "stagepower",
      "percussion",
      "pitchless",
    ]);
    const generic = harness(new Midi(), GENERIC_PROFILE, "LEAD GUITAR").session;
    expect(profileFromSession(generic)).toBe(GENERIC_PROFILE);
    expect(VOCALS.classify(85)).toBe("pitchless");
    expect(VOCALS.classify(35)).toBe("pitchless");
    expect(VOCALS.classify(111)).toBe("phrase:power-window");
    expect(VOCALS.laneForPitch(35)?.id).toBe("pitchless");
    expect(VOCALS.laneForPitch(60)).toBeNull();
    expect([36, 60, 84].map(pitchName)).toEqual(["C2", "C4", "C6"]);
  });

  it("keeps the generic grid identical: header origin and 0-127", () => {
    const coordinates = makeCoordinates(GENERIC_PROFILE, 127);
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
      [GENERIC_PROFILE, 1],
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
          getGlobalEditingSession: () => ({
            execute: (command: {
              type: string;
              tick?: number;
              name?: string;
            }) => {
              if (command.type !== "ADD_SECTION") return { changed: false };
              track.addTextEvent(
                MetaType.Marker,
                command.tick!,
                `[section ${command.name}]`,
              );
              return { changed: true };
            },
          }),
          getTempoEvents: () => TEMPO,
          getTimeSignatureEvents: () => [],
          getTextEvents: () => [],
          invalidateTempoCache: () => {},
          requestRender: () => {},
        } as never,
        makeCoordinates(profile),
      );
      header.handleLeftClick(new Vector2(300, HeaderHeight - 4));
      const markers = track
        .getTextEvents()
        .filter((event) => event.type === MetaType.Marker);
      expect(markers).toHaveLength(expected);
    }
  });
});

describe("vocal note editing", () => {
  it("keeps the note as a preview until its lyric is committed", () => {
    const h = harness();
    h.drag(new Vector2(xAt(0), yAt(60)), xAt(480));

    expect(h.track()).toBeNull();
    expect(h.notes()).toEqual([]);
    expect(h.context.getPreviewState!()?.added).toMatchObject([
      { pitch: 60, tick: 0, duration: 480 },
    ]);
    expect(h.calls.prompts.map((p) => p.tick)).toEqual([0]);
    expect(h.editing.isAwaitingLyric).toBe(true);
    expect(h.standalone.history.isInTransaction).toBe(false);
    expect(h.calls.previews).toBe(1);

    expect(h.calls.prompts[0].handlers.onCommit("la")).toBe(true);
    expect(h.standalone.history.undoDepth).toBe(1);
    expect(h.standalone.history.isInTransaction).toBe(false);
    expect(h.track()).not.toBeNull();
    expect(h.notes().map((n) => [n.pitch, n.tick, n.durationTicks])).toEqual([
      [60, 0, 480],
    ]);
    expect(h.lyrics()).toEqual([[0, "la"]]);
    expect(validateVocalTrack(h.track(), VOCALS.vocal!)).toEqual([]);
  });

  it("cancels an empty lyric submission without changing MIDI or history", () => {
    const h = harness();
    const before = h.midi.toBuffer();
    h.drag(new Vector2(xAt(0), yAt(60)), xAt(480));

    expect(h.calls.prompts[0]!.handlers.onCommit("   ")).toBe(false);
    expect(h.track()).toBeNull();
    expect(h.midi.toBuffer()).toEqual(before);
    expect(h.standalone.history.undoDepth).toBe(0);
    expect(h.standalone.history.isDirty).toBe(false);
    expect(h.editing.isAwaitingLyric).toBe(false);
  });

  describe("generic note editing", () => {
    it("materializes the selected configured track for note placement", () => {
      const h = harness(new Midi(), GENERIC_PROFILE, "LEAD GUITAR");
      const genericY = HeaderHeight + (84 - 60) * 18 + 5;

      h.drag(new Vector2(xAt(0), genericY), xAt(480));

      expect(h.track()?.name).toBe("LEAD GUITAR");
      expect(
        h.notes().map((note) => [note.pitch, note.tick, note.durationTicks]),
      ).toEqual([[60, 0, 480]]);
    });

    it("keeps an existing unmapped selected track as the placement target", () => {
      const midi = new Midi();
      const unmapped = new MidiTrack("Unmapped track");
      midi.tracks.push(unmapped);
      const h = harness(midi, GENERIC_PROFILE, "LEAD GUITAR", 0);
      const genericY = HeaderHeight + (84 - 60) * 18 + 5;

      h.drag(new Vector2(xAt(0), genericY), xAt(480));

      expect(midi.tracks).toEqual([unmapped]);
      expect(h.track()).toBe(unmapped);
      expect(h.notes().map((note) => note.pitch)).toEqual([60]);
    });

    it("does not create a fallback track without a configured instrument", () => {
      const h = harness(new Midi(), GENERIC_PROFILE, "not configured");
      const genericY = HeaderHeight + (84 - 60) * 18 + 5;
      const initialTracks = [...h.midi.tracks];

      expect(() => h.drag(new Vector2(xAt(0), genericY), xAt(480))).toThrow();

      expect(h.midi.tracks).toEqual(initialTracks);
      expect(h.standalone.history.undoDepth).toBe(0);
    });
  });

  it("cancels the whole create on Escape without a history rollback", () => {
    const h = harness();
    h.drag(new Vector2(xAt(0), yAt(60)), xAt(480));
    h.calls.prompts[0].handlers.onCancel();
    expect(h.track()).toBeNull();
    expect(h.notes()).toEqual([]);
    expect(h.lyrics()).toEqual([]);
    expect(h.standalone.history.undoDepth).toBe(0);
    expect(h.standalone.history.isDirty).toBe(false);
    expect(h.editing.isAwaitingLyric).toBe(false);
  });

  it("cancels a vocal move with no document or history trace (I-2)", () => {
    const h = harness();
    h.drag(new Vector2(xAt(0), yAt(60)), xAt(480));
    h.calls.prompts[0]!.handlers.onCommit("la");
    const before = h.midi.toBuffer();
    const note = h.notes()[0]!;
    h.editing.beginMove(note);
    h.editing.updateMove(new Vector2(xAt(1440), yAt(62)));

    expect(h.midi.toBuffer()).toEqual(before);
    expect(h.standalone.history.undoDepth).toBe(1);
    expect(h.standalone.history.isDirty).toBe(true);

    h.editing.cancelGesture();
    expect(h.midi.toBuffer()).toEqual(before);
    expect(h.standalone.history.undoDepth).toBe(1);
    expect(h.standalone.history.redoDepth).toBe(0);
    expect(h.standalone.history.isDirty).toBe(true);
    expect(h.editing.isAwaitingLyric).toBe(false);
  });

  it("previews an erase and cancels it without a document or history trace", () => {
    const h = seeded();
    const before = h.midi.toBuffer();
    const note = h.notes()[0]!;

    expect(h.editing.beginErase()).toBe(true);
    h.editing.eraseNote(note);
    expect(h.notes()).toHaveLength(3);
    expect(h.context.getDisplayNotes!(h.notes())).toHaveLength(2);

    h.editing.cancelGesture();
    expect(h.midi.toBuffer()).toEqual(before);
    expect(h.standalone.history.undoDepth).toBe(0);
    expect(h.standalone.history.isDirty).toBe(false);
    expect(h.context.getPreviewState!()).toBeNull();
  });

  it("commits an erase gesture as one history entry", () => {
    const h = seeded();
    const note = h.notes()[0]!;

    expect(h.editing.beginErase()).toBe(true);
    h.editing.eraseNote(note);
    h.editing.finishGesture();

    expect(h.notes()).toHaveLength(2);
    expect(h.standalone.history.undoDepth).toBe(1);
  });

  it("creates lane kinds by dragging in their lane, without a lyric prompt", () => {
    const h = harness();
    h.drag(new Vector2(xAt(0), laneY(3)), xAt(240));
    h.drag(new Vector2(xAt(480), laneY(4)), xAt(720));
    expect(h.notes().map((n) => n.pitch)).toEqual([90]);
    // Percussion: no prompt. Pitchless: prompt.
    expect(h.calls.prompts.map((p) => p.tick)).toEqual([480]);
    expect(h.calls.prompts[0]!.handlers.onCommit("word")).toBe(true);
    expect(h.notes().map((n) => n.pitch)).toEqual([90, 85]);
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
    expect(h.standalone.history.isInTransaction).toBe(false);
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
    copySelectionToClipboard(h);
    h.session.pasteClipboard(1920);
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
