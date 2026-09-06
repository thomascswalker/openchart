import { Midi } from "@midiedit/core";
import { Audio } from "ts-audio";
import { useEffect, useRef, type ChangeEvent } from "react";
import { useEditor } from "../context/EditorContext";
import { usePlayback } from "../context/PlaybackContext";

const MIDI_FILE_PICKER_TYPES: FilePickerAcceptType[] = [
  {
    description: "MIDI file",
    accept: { "audio/midi": [".mid", ".midi"] },
  },
];

const WAV_FILE_PICKER_TYPES: FilePickerAcceptType[] = [
  {
    description: "WAV file",
    accept: { "audio/wav": [".wav"] },
  },
];

interface LoadedFile {
  file: File;
  data: ArrayBuffer;
  handle: FileSystemFileHandle | null;
}

type FileLoadHandler = (loadedFile: LoadedFile) => void;

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

async function loadFile(
  file: File,
  handle: FileSystemFileHandle | null,
  onLoad: FileLoadHandler,
): Promise<void> {
  onLoad({ file, data: await file.arrayBuffer(), handle });
}

interface ToolbarProps {
  debugVisible: boolean;
  onDebugToggle: () => void;
}

export const Toolbar = ({ debugVisible, onDebugToggle }: ToolbarProps) => {
  const midiFileRef = useRef<HTMLInputElement>(null);
  const midiLoadRef = useRef(0);

  const audioFileRef = useRef<HTMLInputElement>(null);
  const audioLoadRef = useRef(0);

  const { setAudio, setAudioFileName } = usePlayback();

  const {
    midiData,
    setMidiData,
    setFileName,
    fileName,
    fileHandle,
    setFileHandle,
  } = useEditor();

  const handleMidiLoad = ({ file, data, handle }: LoadedFile): void => {
    setFileName(file.name);
    setMidiData(new Midi(new Uint8Array(data)));
    setFileHandle(handle);
  };

  const handleAudioLoad = ({ file }: LoadedFile): void => {
    setAudio(Audio({ file: URL.createObjectURL(file), preload: true }));
    setAudioFileName(file.name);
  };

  const triggerFileDialog = (
    types: FilePickerAcceptType[],
    fallbackInput: React.RefObject<HTMLInputElement | null>,
    onLoad: FileLoadHandler,
  ): void => {
    if (supportsFileSystemAccess) {
      void (async () => {
        try {
          const [handle] = await window.showOpenFilePicker!({
            types,
          });
          const file = await handle.getFile();
          await loadFile(file, handle, onLoad);
        } catch (error: unknown) {
          if (!isAbortError(error)) {
            console.error("Failed to open file", error);
          }
        }
      })();
      return;
    }

    fallbackInput.current?.click();
  };

  const handleMidiFileLoad = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = event.target.files;

    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];
    const requestId = ++midiLoadRef.current;

    void loadFile(file, null, (loadedFile) => {
      if (requestId !== midiLoadRef.current) {
        return;
      }

      handleMidiLoad(loadedFile);
    }).catch((error: unknown) => {
      if (requestId === midiLoadRef.current) {
        console.error("Failed to load MIDI file", error);
      }
    });
  };

  const handleAudioFileLoad = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = event.target.files;

    if (!files || files.length === 0) {
      return;
    }

    const requestId = ++audioLoadRef.current;

    void loadFile(files[0], null, (loadedFile) => {
      if (requestId === audioLoadRef.current) {
        handleAudioLoad(loadedFile);
      }
    }).catch((error: unknown) => {
      if (requestId === audioLoadRef.current) {
        console.error("Failed to load audio file", error);
      }
    });
  };

  const handleMidiSaveAs = (): void => {
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

  const handleMidiSave = (): void => {
    if (!midiData) {
      return;
    }

    if (!fileHandle) {
      handleMidiSaveAs();
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
        triggerFileDialog(MIDI_FILE_PICKER_TYPES, midiFileRef, handleMidiLoad);
      } else if (key === "s" && event.shiftKey) {
        event.preventDefault();
        handleMidiSaveAs();
      } else if (key === "s") {
        event.preventDefault();
        handleMidiSave();
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
        <button
          type="button"
          onClick={() =>
            triggerFileDialog(
              MIDI_FILE_PICKER_TYPES,
              midiFileRef,
              handleMidiLoad,
            )
          }
        >
          Open
        </button>

        <button type="button" disabled={!midiData} onClick={handleMidiSave}>
          Save
        </button>

        <button type="button" disabled={!midiData} onClick={handleMidiSaveAs}>
          Save As
        </button>

        <button
          type="button"
          onClick={() =>
            triggerFileDialog(
              WAV_FILE_PICKER_TYPES,
              audioFileRef,
              handleAudioLoad,
            )
          }
        >
          Open Audio
        </button>

        <button
          type="button"
          onClick={onDebugToggle}
          aria-pressed={debugVisible}
        >
          {debugVisible ? "Hide Debug" : "Debug"}
        </button>
      </div>

      <div className="midi-toolbar__file">
        {fileName ?? "No MIDI file loaded"}
      </div>

      <input
        ref={midiFileRef}
        type="file"
        accept=".mid,.midi"
        onChange={handleMidiFileLoad}
        hidden
      />

      <input
        ref={audioFileRef}
        type="file"
        accept=".wav"
        onChange={handleAudioFileLoad}
        hidden
      />
    </header>
  );
};
