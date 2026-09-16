import { Midi } from "@midiedit/core";
import { Audio } from "ts-audio";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { useEditor } from "../context/EditorContext";
import { usePlayback } from "../context/PlaybackContextStore";

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

export type EditorCommandId =
  | "new"
  | "open"
  | "save"
  | "save-as"
  | "export"
  | "settings"
  | "open-audio"
  | "toggle-debug"
  | "close-debug"
  | "close-settings";

export interface ActiveDocument {
  midiData: Midi | null;
  fileName: string | null;
  fileHandle: FileSystemFileHandle | null;
}

export type CommandAvailability = Record<EditorCommandId, boolean>;

export interface EditorCommandContextValue {
  activeDocument: ActiveDocument;
  isDirty: boolean;
  error: string | null;
  debugVisible: boolean;
  settingsVisible: boolean;
  canExecute: CommandAvailability;
  dispatch: (command: EditorCommandId) => Promise<void>;
  markDirty: () => void;
  clearError: () => void;
}

interface EditorCommandProviderProps {
  children: ReactNode;
}

interface LoadedFile {
  file: File;
  data: ArrayBuffer;
  handle: FileSystemFileHandle | null;
}

function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function"
  );
}

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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}

function hasExtension(file: File, extensions: string[]): boolean {
  const name = file.name.toLowerCase();
  return extensions.some((extension) => name.endsWith(extension));
}

const EditorCommandContext = createContext<
  EditorCommandContextValue | undefined
>(undefined);

export function EditorCommandProvider({
  children,
}: EditorCommandProviderProps) {
  const {
    midiData,
    setMidiData,
    fileName,
    setFileName,
    fileHandle,
    setFileHandle,
  } = useEditor();
  const { setAudio, setAudioFileName } = usePlayback();
  const midiFileRef = useRef<HTMLInputElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);
  const midiLoadRef = useRef(0);
  const audioLoadRef = useRef(0);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugVisible, setDebugVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const activeDocument = useMemo<ActiveDocument>(
    () => ({ midiData, fileName, fileHandle }),
    [fileHandle, fileName, midiData],
  );

  const canSave = midiData!.trackCount !== 0 || false;
  const canExecute = useMemo<CommandAvailability>(
    () => ({
      new: true,
      open: true,
      save: canSave,
      "save-as": canSave,
      export: canSave,
      settings: true,
      "open-audio": true,
      "toggle-debug": true,
      "close-debug": debugVisible,
      "close-settings": settingsVisible,
    }),
    [canSave, debugVisible, settingsVisible],
  );

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const canDiscardChanges = useCallback((): boolean => {
    if (!isDirty) {
      return true;
    }

    return window.confirm(
      "This document has unsaved changes. Discard them and continue?",
    );
  }, [isDirty]);

  const loadMidi = useCallback(
    ({ file, data, handle }: LoadedFile): void => {
      if (!hasExtension(file, [".mid", ".midi"])) {
        throw new Error("Choose a MIDI file (.mid or .midi).");
      }

      const parsed = new Midi(new Uint8Array(data));
      setMidiData(parsed);
      setFileName(file.name);
      setFileHandle(handle);
      setIsDirty(false);
      setError(null);
    },
    [setFileHandle, setFileName, setMidiData],
  );

  const loadAudio = useCallback(
    ({ file }: LoadedFile): void => {
      if (!hasExtension(file, [".wav"])) {
        throw new Error("Choose a WAV audio file (.wav).");
      }

      setAudio(Audio({ file: URL.createObjectURL(file), preload: true }));
      setAudioFileName(file.name);
      setError(null);
    },
    [setAudio, setAudioFileName],
  );

  const openPicker = useCallback(
    (
      types: FilePickerAcceptType[],
      fallbackInput: RefObject<HTMLInputElement | null>,
      onLoad: (loadedFile: LoadedFile) => void,
    ): void => {
      if (supportsFileSystemAccess()) {
        void (async () => {
          try {
            const [handle] = await window.showOpenFilePicker!({ types });
            const file = await handle.getFile();
            onLoad({ file, data: await file.arrayBuffer(), handle });
          } catch (loadError: unknown) {
            if (!isAbortError(loadError)) {
              setError(errorMessage(loadError, "Failed to open file."));
            }
          }
        })();
        return;
      }

      fallbackInput.current?.click();
    },
    [],
  );

  const handleMidiFileLoad = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }

      const requestId = ++midiLoadRef.current;
      void file
        .arrayBuffer()
        .then((data) => {
          if (requestId !== midiLoadRef.current) {
            return;
          }
          loadMidi({ file, data, handle: null });
        })
        .catch((loadError: unknown) => {
          if (requestId === midiLoadRef.current) {
            setError(errorMessage(loadError, "Failed to open MIDI file."));
          }
        });
    },
    [loadMidi],
  );

  const handleAudioFileLoad = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }

      const requestId = ++audioLoadRef.current;
      void file
        .arrayBuffer()
        .then((data) => {
          if (requestId !== audioLoadRef.current) {
            return;
          }
          loadAudio({ file, data, handle: null });
        })
        .catch((loadError: unknown) => {
          if (requestId === audioLoadRef.current) {
            setError(errorMessage(loadError, "Failed to open audio file."));
          }
        });
    },
    [loadAudio],
  );

  const saveAs = useCallback(async (): Promise<void> => {
    if (!canSave) {
      throw new Error("There is no MIDI document to save.");
    }

    const data = midiData!.toBuffer();
    const suggestedName = fileName ?? "untitled.mid";

    if (supportsFileSystemAccess()) {
      const handle = await window.showSaveFilePicker!({
        types: MIDI_FILE_PICKER_TYPES,
        suggestedName,
      });
      const writable = await handle.createWritable();
      await writable.write(toArrayBuffer(data));
      await writable.close();
      setFileHandle(handle);
      setFileName(handle.name);
    } else {
      downloadBuffer(data, suggestedName);
    }

    setIsDirty(false);
  }, [canSave, fileName, midiData, setFileHandle, setFileName]);

  const save = useCallback(async (): Promise<void> => {
    if (!canSave) {
      throw new Error("There is no MIDI document to save.");
    }

    if (!fileHandle) {
      await saveAs();
      return;
    }

    const writable = await fileHandle.createWritable();
    await writable.write(toArrayBuffer(midiData!.toBuffer()));
    await writable.close();
    setIsDirty(false);
  }, [canSave, fileHandle, midiData, saveAs]);

  const exportMidi = useCallback((): void => {
    if (!canSave) {
      throw new Error("There is no MIDI document to export.");
    }

    downloadBuffer(midiData!.toBuffer(), fileName ?? "untitled.mid");
  }, [canSave, fileName, midiData]);

  const dispatch = useCallback(
    async (command: EditorCommandId): Promise<void> => {
      setError(null);

      if (!canExecute[command]) {
        setError("This command is not available for the active document.");
        return;
      }

      try {
        switch (command) {
          case "new":
            if (!canDiscardChanges()) {
              return;
            }
            setMidiData(new Midi());
            setFileName(null);
            setFileHandle(null);
            setIsDirty(false);
            return;
          case "open":
            if (!canDiscardChanges()) {
              return;
            }
            openPicker(MIDI_FILE_PICKER_TYPES, midiFileRef, loadMidi);
            return;
          case "save":
            await save();
            return;
          case "save-as":
            await saveAs();
            return;
          case "export":
            exportMidi();
            return;
          case "settings":
            setSettingsVisible(true);
            return;
          case "open-audio":
            openPicker(WAV_FILE_PICKER_TYPES, audioFileRef, loadAudio);
            return;
          case "toggle-debug":
            setDebugVisible((visible) => !visible);
            return;
          case "close-debug":
            setDebugVisible(false);
            return;
          case "close-settings":
            setSettingsVisible(false);
            return;
        }
      } catch (commandError: unknown) {
        if (!isAbortError(commandError)) {
          setError(
            errorMessage(commandError, "The command could not be completed."),
          );
        }
      }
    },
    [
      canDiscardChanges,
      canExecute,
      exportMidi,
      loadAudio,
      loadMidi,
      openPicker,
      save,
      saveAs,
      setFileHandle,
      setFileName,
      setMidiData,
    ],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isTypingTarget(event.target)) {
        return;
      }

      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      const command =
        key === "o"
          ? "open"
          : key === "s" && event.shiftKey
            ? "save-as"
            : key === "s"
              ? "save"
              : null;

      if (!command) {
        return;
      }

      event.preventDefault();
      void dispatch(command);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);

  const value = useMemo<EditorCommandContextValue>(
    () => ({
      activeDocument,
      isDirty,
      error,
      debugVisible,
      settingsVisible,
      canExecute,
      dispatch,
      markDirty,
      clearError,
    }),
    [
      activeDocument,
      canExecute,
      clearError,
      debugVisible,
      dispatch,
      error,
      isDirty,
      markDirty,
      settingsVisible,
    ],
  );

  return (
    <EditorCommandContext.Provider value={value}>
      {children}
      <input
        ref={midiFileRef}
        type="file"
        accept=".mid,.midi"
        onChange={handleMidiFileLoad}
        hidden
        aria-hidden="true"
      />
      <input
        ref={audioFileRef}
        type="file"
        accept=".wav"
        onChange={handleAudioFileLoad}
        hidden
        aria-hidden="true"
      />
    </EditorCommandContext.Provider>
  );
}

export function useEditorCommands(): EditorCommandContextValue {
  const context = useContext(EditorCommandContext);
  if (!context) {
    throw new Error(
      "useEditorCommands must be used within an EditorCommandProvider",
    );
  }
  return context;
}
