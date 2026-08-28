import { useRef, useState, type ChangeEvent } from "react";

import { Midi } from "@midiedit/core";

import { MidiProvider, useMidi } from "./MidiContext";

import { ChartViewHost } from "./views/ChartViewHost";
import { CHART_VIEWS } from "./views/ChartViews";

import "./MidiEditor.css";

function MidiToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadRequestRef = useRef(0);

  const { midiData, setMidiData, setFileName, fileName } = useMidi();

  const triggerFileDialog = (): void => {
    fileInputRef.current?.click();
  };

  const handleFileLoad = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = event.target.files;

    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];
    const requestId = ++loadRequestRef.current;

    void file
      .arrayBuffer()
      .then((data) => {
        if (requestId !== loadRequestRef.current) {
          return;
        }

        setFileName(file.name);
        setMidiData(new Midi(new Uint8Array(data)));
      })
      .catch((error: unknown) => {
        if (requestId === loadRequestRef.current) {
          console.error("Failed to load MIDI file", error);
        }
      });
  };

  const handleSave = (): void => {
    if (!midiData) {
      return;
    }

    // TODO:
    // Serialize MIDI and save using fileName.
    console.log("Save", fileName);
  };

  const handleSaveAs = (): void => {
    if (!midiData) {
      return;
    }

    // TODO:
    // Serialize MIDI and choose a new file.
    console.log("Save As");
  };

  return (
    <header className="midi-toolbar">
      <div className="midi-toolbar__actions">
        <button type="button" onClick={triggerFileDialog}>
          Open
        </button>

        <button type="button" disabled={!midiData} onClick={handleSave}>
          Save
        </button>

        <button type="button" disabled={!midiData} onClick={handleSaveAs}>
          Save As
        </button>
      </div>

      <div className="midi-toolbar__file">
        {fileName ?? "No MIDI file loaded"}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi"
        onChange={handleFileLoad}
        hidden
      />
    </header>
  );
}

interface TrackListProps {
  selectedTrackIndex: number | null;

  onSelectTrack(index: number): void;
}

function TrackList({ selectedTrackIndex, onSelectTrack }: TrackListProps) {
  const { midiData } = useMidi();

  if (!midiData) {
    return (
      <div className="track-list track-list--empty">No MIDI file loaded.</div>
    );
  }

  return (
    <div className="track-list">
      {midiData.tracks.map((track, index) => {
        const selected = selectedTrackIndex === index;

        return (
          <div
            key={index}
            className={selected ? "track-row track-row--selected" : "track-row"}
            onClick={() => {
              onSelectTrack(index);
            }}
          >
            <div className="track-row__header">
              <span className="track-row__number">{index + 1}</span>

              <span className="track-row__name">
                {track.name || `Track ${index + 1}`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface MidiViewportProps {
  selectedTrackIndex: number | null;
}

function MidiViewport({ selectedTrackIndex }: MidiViewportProps) {
  const { midiData } = useMidi();
  const [activeViewId, setActiveViewId] = useState(CHART_VIEWS[0].id);

  const activeView =
    CHART_VIEWS.find((view) => view.id === activeViewId) ?? CHART_VIEWS[0];

  const selectedTrack =
    midiData && selectedTrackIndex !== null
      ? midiData.tracks[selectedTrackIndex]
      : null;

  return (
    <section className="midi-view">
      <div className="midi-view__header">
        <div className="midi-view__title">
          <strong>{activeView.name}</strong>

          <span>
            {selectedTrack
              ? selectedTrack.name || `Track ${selectedTrackIndex! + 1}`
              : "No track selected"}
          </span>
        </div>

        <div>
          <select
            value={activeViewId}
            onChange={(event) => {
              setActiveViewId(event.target.value);
            }}
          >
            {CHART_VIEWS.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="midi-view__body">
        <ChartViewHost
          createRenderer={activeView.createRenderer}
          state={{
            midi: midiData,
            selectedTrackIndex,
          }}
        />
      </div>
    </section>
  );
}

function MidiWorkspace() {
  const { midiData } = useMidi();

  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number | null>(
    null,
  );

  const selectedTrackIsValid =
    midiData !== null &&
    selectedTrackIndex !== null &&
    selectedTrackIndex < midiData.tracks.length;

  const actualSelectedTrack = selectedTrackIsValid
    ? selectedTrackIndex
    : midiData && midiData.tracks.length > 0
      ? 0
      : null;

  return (
    <div className="midi-workspace">
      <section className="arrangement">
        <div className="arrangement__header">
          <strong>Tracks</strong>

          {midiData && (
            <span className="arrangement__metadata">
              Format {midiData.header.format}
              {" · "}
              PPQN {midiData.header.division}
              {" · "}
              {midiData.tracks.length} tracks
            </span>
          )}
        </div>

        <TrackList
          selectedTrackIndex={actualSelectedTrack}
          onSelectTrack={setSelectedTrackIndex}
        />
      </section>
      <MidiViewport selectedTrackIndex={actualSelectedTrack} />
    </div>
  );
}

function MidiEditorContent() {
  return (
    <div className="midi-editor">
      <MidiToolbar />
      <MidiWorkspace />
    </div>
  );
}

function MidiEditor() {
  return (
    <MidiProvider>
      <MidiEditorContent />
    </MidiProvider>
  );
}

export default MidiEditor;
