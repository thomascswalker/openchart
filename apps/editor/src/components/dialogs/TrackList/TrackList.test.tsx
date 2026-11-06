import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { Midi, MidiTrack } from '@openchart/midi';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useProject } from '../../../hooks/useProject';
import { TrackList } from './TrackList';

vi.mock('../../../hooks/useProject', () => ({
  useProject: vi.fn(),
}));

vi.mock('../../../actions/execute', () => ({
  runActionAsync: vi.fn(),
}));

const mockedUseProject = vi.mocked(useProject);
let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderTrackList(): void {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<TrackList />));
}

function setMidi(midi: Midi | null): void {
  mockedUseProject.mockReturnValue({
    data: midi,
  } as ReturnType<typeof useProject>);
  act(() => root?.render(<TrackList />));
}

describe('TrackList', () => {
  it('keeps hooks stable and rebuilds its SongView when the project changes', () => {
    mockedUseProject.mockReturnValue({
      data: null,
    } as unknown as ReturnType<typeof useProject>);
    renderTrackList();
    expect(container?.textContent).toContain('No MIDI data');

    const firstMidi = new Midi();
    firstMidi.tracks.push(new MidiTrack('LEAD GUITAR'));
    setMidi(firstMidi);
    expect(container?.textContent).toContain('LEAD GUITAR');

    const nextMidi = new Midi();
    nextMidi.tracks.push(new MidiTrack('VOCALS'));
    setMidi(nextMidi);
    expect(container?.textContent).toContain('VOCALS');
    expect(container?.textContent).not.toContain('LEAD GUITAR');
  });
});
