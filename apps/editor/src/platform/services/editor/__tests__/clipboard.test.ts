import { MetaType, Midi } from '@openchart/midi';
import {
  Difficulty,
  SongView,
  VocalNoteKind,
  formatNoteId,
} from '@openchart/views';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnyChartView } from '../../../../components/views/ChartViews';
import { mockLoggerService } from '../../__mock__/logger.mock';
import type { PlaybackService } from '../../playback/playback';
import { ProjectService } from '../../project/project';
import { createTestRulesetService } from '../../ruleset/__tests__/testUtils';
import { mockWorkspaceService } from '../../workspace/__tests__/utils';
import { ActiveChartViewService } from '../activeChartView';
import { EditorClipboardService } from '../clipboard';
import { EditingService } from '../editing';
import { EditorStateService } from '../state';
import { ViewportService } from '../viewports';

function createClipboardHarness(midi: Midi) {
  const ruleset = createTestRulesetService();
  const logger = mockLoggerService();
  const workspace = mockWorkspaceService();
  const project = new ProjectService(logger, ruleset, workspace);
  project.init();
  project.data = midi;
  const playbackListeners = new Set<() => void>();
  let isPlaying = false;
  const playback = {
    refresh: vi.fn(),
    getSnapshot: () => ({ isPlaying }),
    subscribe: (listener: () => void) => {
      playbackListeners.add(listener);
      return () => playbackListeners.delete(listener);
    },
  } as unknown as PlaybackService;
  const viewports = new ViewportService(ruleset);
  viewports.init();
  const firstTrack = midi.tracks[0];
  const descriptor = firstTrack
    ? ruleset.compiled.byName.get(firstTrack.name)
    : undefined;
  if (descriptor) {
    viewports.updateViewport(viewports.getSnapshot().activeViewportId, {
      trackKey: descriptor.key,
      instrument: descriptor.name,
    });
  }
  const editing = new EditingService(project, playback, viewports, ruleset);
  editing.init();
  const activeView = new ActiveChartViewService();
  activeView.init();
  const state = new EditorStateService();
  const clipboard = new EditorClipboardService(
    activeView,
    editing,
    state,
    playback,
  );
  clipboard.init();

  return {
    activeView,
    clipboard,
    project,
    editing,
    setPlaying(playing: boolean) {
      isPlaying = playing;
      playbackListeners.forEach((listener) => listener());
    },
    state,
    viewports,
  };
}

function setActiveView(
  activeView: ActiveChartViewService,
  kind: 'highway' | 'piano-roll',
  tick: number,
) {
  activeView.set({
    kind,
    getPasteAnchorTick: () => tick,
  } as unknown as AnyChartView);
}

function selectOnlyNote(
  editing: EditingService,
  track: Midi['tracks'][number],
): void {
  const session = editing.getActiveSession();
  if (!session) throw new Error('Expected an active editing session');
  const trackIndex = session.target.trackIndex;
  if (trackIndex === null) throw new Error('Expected a resolved target track');
  const note = track.getNotes()[0];
  if (!note) throw new Error('Expected a note to select');
  session.selection.setSelectedIds([
    formatNoteId(trackIndex, track.getEventId(note.noteOn)),
  ]);
}

describe('EditorClipboardService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pastes Highway notes into Piano Roll as raw pitches', () => {
    const midi = new Midi();
    const track = midi.tracks[midi.addTrack()]!;
    track.name = 'LEAD GUITAR';
    track.addNote(96, 0, 90, 120);
    const h = createClipboardHarness(midi);
    const viewportId = h.viewports.getSnapshot().activeViewportId;
    h.viewports.updateViewport(viewportId, { view: 'highway' });
    setActiveView(h.activeView, 'highway', 0);
    selectOnlyNote(h.editing, track);

    h.clipboard.copy();
    h.viewports.updateViewport(viewportId, { view: 'piano-roll' });
    setActiveView(h.activeView, 'piano-roll', 480);
    expect(h.editing.getActiveSession()?.selection.getSelectedIds()).toEqual([
      formatNoteId(0, track.getEventId(track.getNotes()[0]!.noteOn)),
    ]);
    h.clipboard.paste();

    expect(track.getNotes()).toMatchObject([
      { pitch: 96, start: 0, end: 120 },
      { pitch: 96, start: 480, end: 600 },
    ]);
  });

  it('pastes an in-range Piano Roll pitch into Highway lanes', () => {
    const midi = new Midi();
    const track = midi.tracks[midi.addTrack()]!;
    track.name = 'LEAD GUITAR';
    track.addNote(96, 0, 90, 120);
    const h = createClipboardHarness(midi);
    const viewportId = h.viewports.getSnapshot().activeViewportId;
    setActiveView(h.activeView, 'piano-roll', 0);
    selectOnlyNote(h.editing, track);
    h.clipboard.copy();

    h.viewports.updateViewport(viewportId, { view: 'highway' });
    setActiveView(h.activeView, 'highway', 480);
    h.clipboard.paste();

    expect(track.getNotes()).toMatchObject([
      { pitch: 96, start: 0, end: 120 },
      { pitch: 96, start: 480, end: 600 },
    ]);
    expect(h.state.getSnapshot().error).toBeNull();
  });

  it('preserves Expert Kick2 when copying and pasting in Highway', () => {
    const midi = new Midi();
    const track = midi.tracks[midi.addTrack()]!;
    track.name = 'DRUMS';
    track.addNote(95, 0, 90, 1);
    const h = createClipboardHarness(midi);
    const viewportId = h.viewports.getSnapshot().activeViewportId;
    h.viewports.updateViewport(viewportId, {
      trackKey: 'drums',
      instrument: 'DRUMS',
      view: 'highway',
    });
    setActiveView(h.activeView, 'highway', 480);
    selectOnlyNote(h.editing, track);

    h.clipboard.copy();
    h.clipboard.paste();

    expect(
      track.getNotes().map(({ pitch: note, start }) => [note, start]),
    ).toEqual([
      [95, 0],
      [95, 480],
    ]);
  });

  it('reports rejected Piano Roll notes pasted outside Highway lanes', () => {
    const midi = new Midi();
    const track = midi.tracks[midi.addTrack()]!;
    track.name = 'LEAD GUITAR';
    track.addNote(20, 0, 90, 120);
    const h = createClipboardHarness(midi);
    const viewportId = h.viewports.getSnapshot().activeViewportId;
    setActiveView(h.activeView, 'piano-roll', 0);
    selectOnlyNote(h.editing, track);
    h.clipboard.copy();

    h.viewports.updateViewport(viewportId, { view: 'highway' });
    setActiveView(h.activeView, 'highway', 480);
    h.clipboard.paste();

    expect(track.getNotes()).toHaveLength(1);
    expect(h.state.getSnapshot().error).toBe(
      '1 note could not be pasted into this chart.',
    );
  });

  it('preserves lyrics when copying and pasting Vocal notes', () => {
    const midi = new Midi();
    const song = new SongView(midi);
    song.ensureMidiTrack('vocals');
    const vocals = song.getVocalTrackView('VOCALS')!;
    vocals.addNote(VocalNoteKind.Pitched, 0, 240, {
      pitch: 60,
      lyric: 'hello',
    });
    const track = midi.getTrack('VOCALS')!;
    const h = createClipboardHarness(midi);
    const viewportId = h.viewports.getSnapshot().activeViewportId;
    h.viewports.updateViewport(viewportId, {
      trackKey: 'vocals',
      instrument: 'VOCALS',
      difficulty: Difficulty.Expert,
      view: 'piano-roll',
    });
    setActiveView(h.activeView, 'piano-roll', 960);
    selectOnlyNote(h.editing, track);

    h.clipboard.copy();
    h.clipboard.paste();

    expect(
      track
        .getTextEvents()
        .filter((event) => event.type === MetaType.Lyric)
        .map(({ tick, text }) => [tick, text]),
    ).toEqual([
      [0, 'hello'],
      [960, 'hello'],
    ]);
  });

  it('cuts notes in one undoable transaction', () => {
    const midi = new Midi();
    const track = midi.tracks[midi.addTrack()]!;
    track.name = 'LEAD GUITAR';
    track.addNote(60, 0, 90, 120);
    const h = createClipboardHarness(midi);
    setActiveView(h.activeView, 'piano-roll', 0);
    selectOnlyNote(h.editing, track);

    h.clipboard.cut();

    expect(track.getNotes()).toHaveLength(0);
    expect(h.project.getSnapshot().canUndo).toBe(true);
    h.project.undoEdit();
    expect(h.project.data.tracks[0]?.getNotes()).toHaveLength(1);
    expect(h.project.getSnapshot().canUndo).toBe(false);
  });

  it('updates menu enablement when playback state changes', () => {
    const midi = new Midi();
    const track = midi.tracks[midi.addTrack()]!;
    track.name = 'LEAD GUITAR';
    track.addNote(60, 0, 90, 120);
    const h = createClipboardHarness(midi);
    setActiveView(h.activeView, 'piano-roll', 0);
    selectOnlyNote(h.editing, track);
    expect(h.clipboard.canCut()).toBe(true);
    h.clipboard.copy();
    expect(h.clipboard.canPaste()).toBe(true);

    h.setPlaying(true);

    expect(h.clipboard.canCut()).toBe(false);
    expect(h.clipboard.canPaste()).toBe(false);
    h.setPlaying(false);
    expect(h.clipboard.canCut()).toBe(true);
    expect(h.clipboard.canPaste()).toBe(true);
  });

  it('shares selected entity IDs across viewport sessions', () => {
    const midi = new Midi();
    const track = midi.tracks[midi.addTrack()]!;
    track.name = 'LEAD GUITAR';
    track.addNote(60, 0, 90, 120);
    track.addNote(64, 240, 90, 120);
    const h = createClipboardHarness(midi);
    const firstViewportId = h.viewports.getSnapshot().activeViewportId;
    const secondViewportId = h.viewports.addViewport('highway');
    if (!secondViewportId) throw new Error('Expected a second viewport');
    h.viewports.updateViewport(secondViewportId, {
      trackKey: 'lead-guitar',
      instrument: 'LEAD GUITAR',
      difficulty: Difficulty.Expert,
    });

    selectOnlyNote(h.editing, track);

    const firstSession = h.editing.getSession(firstViewportId)!;
    const secondSession = h.editing.getSession(secondViewportId)!;
    const secondNote = track.getNotes()[1]!;
    const secondNoteId = formatNoteId(0, track.getEventId(secondNote.noteOn));
    expect(secondSession.selection.getSelectedIds()).toEqual(
      firstSession.selection.getSelectedIds(),
    );

    secondSession.selection.setSelectedIds([secondNoteId]);

    expect(firstSession.selection.getSelectedIds()).toEqual([secondNoteId]);
  });
});
