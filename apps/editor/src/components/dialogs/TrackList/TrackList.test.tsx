import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDocument } from "../../../hooks/useDocument";
import { Midi, MidiTrack } from "@openchart/midi";
import { TrackList } from "./TrackList";

vi.mock("../../../hooks/useDocument", () => ({
  useDocument: vi.fn(),
}));

vi.mock("../../../actions/execute", () => ({
  runActionAsync: vi.fn(),
}));

const mockedUseDocument = vi.mocked(useDocument);
let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderTrackList(): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<TrackList />));
}

function setMidi(midi: Midi | null): void {
  mockedUseDocument.mockReturnValue({
    midi,
  } as ReturnType<typeof useDocument>);
  act(() => root?.render(<TrackList />));
}

describe("TrackList", () => {
  it("keeps hooks stable and rebuilds its SongView when the document changes", () => {
    mockedUseDocument.mockReturnValue({
      midi: null,
    } as ReturnType<typeof useDocument>);
    renderTrackList();
    expect(container?.textContent).toContain("No MIDI data");

    const firstMidi = new Midi();
    firstMidi.tracks.push(new MidiTrack("LEAD GUITAR"));
    setMidi(firstMidi);
    expect(container?.textContent).toContain("LEAD GUITAR");

    const nextMidi = new Midi();
    nextMidi.tracks.push(new MidiTrack("VOCALS"));
    setMidi(nextMidi);
    expect(container?.textContent).toContain("VOCALS");
    expect(container?.textContent).not.toContain("LEAD GUITAR");
  });
});
