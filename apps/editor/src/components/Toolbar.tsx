import { Midi } from "@midiedit/core";
import { useRef, type ChangeEvent, useEffect } from "react";
import { useEditor } from "./Context";

const MIDI_FILE_PICKER_TYPES: FilePickerAcceptType[] = [
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

export const Toolbar = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadRequestRef = useRef(0);

  const {
    midiData,
    setMidiData,
    setFileName,
    fileName,
    fileHandle,
    setFileHandle,
  } = useEditor();

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
};
