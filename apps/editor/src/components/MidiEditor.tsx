import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Midi } from "@midiedit/core";

import { MidiProvider, useMidi } from "./MidiContext";

import { ChartViewHost } from "./views/ChartViewHost";
import { CHART_VIEWS } from "./views/ChartViews";

import "./MidiEditor.css";

const MIDI_FILE_PICKER_TYPES = [
  {
    description: "MIDI file",
    accept: { "audio/midi": [".mid", ".midi"] },
  },
];

// Browsers without the File System Access API fall back to input/download.
const supportsFileSystemAccess =
  typeof window.showOpenFilePicker === "function" &&
  typeof window.showSaveFilePicker === "function";

// Uint8Array's ArrayBufferLike generic isn't directly assignable to Blob/FS Access APIs.
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}

function downloadBuffer(data: Uint8Array, name: string): void {
  const url = URL.createObjectURL(
    new Blob([toArrayBuffer(data)], { type: "audio/midi" }),
  );
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = name;
  anchor.click();

  URL.revokeObjectURL(url);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function MidiToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadRequestRef = useRef(0);

  const {
    midiData,
    setMidiData,
    setFileName,
    fileName,
    fileHandle,
    setFileHandle,
  } = useMidi();

  const triggerFileDialog = (): void => {
    if (supportsFileSystemAccess) {
      void (async () => {
        try {
          const [handle] = await window.showOpenFilePicker!({
            types: MIDI_FILE_PICKER_TYPES,
          });
          const file = await handle.getFile();
          const data = await file.arrayBuffer();

          setFileName(file.name);
          setMidiData(new Midi(new Uint8Array(data)));
          setFileHandle(handle);
        } catch (error: unknown) {
          if (!isAbortError(error)) {
            console.error("Failed to open MIDI file", error);
          }
        }
      })();
      return;
    }

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
        // No handle available via <input type="file">, so there's no save path yet.
        setFileHandle(null);
      })
      .catch((error: unknown) => {
        if (requestId === loadRequestRef.current) {
          console.error("Failed to load MIDI file", error);
        }
      });
  };

  const handleSaveAs = (): void => {
    if (!midiData) {
      return;
    }

    const data = midiData.toBuffer();

    if (supportsFileSystemAccess) {
      void (async () => {
        try {
          const handle = await window.showSaveFilePicker!({
            types: MIDI_FILE_PICKER_TYPES,
            suggestedName: fileName ?? "untitled.mid",
          });
          const writable = await handle.createWritable();

          await writable.write(toArrayBuffer(data));
          await writable.close();

          setFileHandle(handle);
          setFileName(handle.name);
        } catch (error: unknown) {
          if (!isAbortError(error)) {
            console.error("Failed to save MIDI file", error);
          }
        }
      })();
      return;
    }

    downloadBuffer(data, fileName ?? "untitled.mid");
  };

  const handleSave = (): void => {
    if (!midiData) {
      return;
    }

    if (!fileHandle) {
      handleSaveAs();
      return;
    }

    void (async () => {
      try {
        const writable = await fileHandle.createWritable();

        await writable.write(toArrayBuffer(midiData.toBuffer()));
        await writable.close();
      } catch (error: unknown) {
        console.error("Failed to save MIDI file", error);
      }
    })();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "o") {
        event.preventDefault();
        triggerFileDialog();
      } else if (key === "s" && event.shiftKey) {
        event.preventDefault();
        handleSaveAs();
      } else if (key === "s") {
        event.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  });

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
