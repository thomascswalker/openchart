import { Midi } from "@midiedit/core";
import { isTauri } from "@tauri-apps/api/core";
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
import { useApplicationSettings } from "../context/ApplicationSettingsContext";
import { useEditor } from "../context/EditorContext";
import { usePlayback } from "../context/PlaybackContextStore";
import {
  discoverSongAudio,
  discoverSongAudioFromHandle,
  discoverMultitrackAudio,
  discoverMultitrackAudioFromHandle,
  listAudioFileNames,
  listAudioFileNamesFromHandle,
} from "../util/audioDiscovery";
import {
  hasReadPermission,
  loadAudioDirectoryHandle,
  requestReadPermission,
  saveAudioDirectoryHandle,
  supportsDirectoryPicker,
} from "../util/audioDirectoryHandle";
import { openFile, saveBytes } from "../project/fileService";
import {
  createProjectDocument,
  deserializeProject,
  exportMidi as exportProjectMidi,
  serializeProject,
  type ProjectDocument,
} from "../project/projectService";
import {
  createProjectMetadata,
  ProjectValidationError,
  type ProjectValidationIssue,
  validateProjectMetadata,
} from "../project/projectMetadata";

const MIDI_FILE_PICKER_TYPES: FilePickerAcceptType[] = [
  {
    description: "MIDI file",
    accept: { "audio/midi": [".mid", ".midi"] },
  },
];

const PROJECT_FILE_PICKER_TYPES: FilePickerAcceptType[] = [
  {
    description: "MIDI project",
    accept: { "application/zip": [".midproject"] },
  },
];

const OPEN_DOCUMENT_FILE_PICKER_TYPES: FilePickerAcceptType[] = [
  ...MIDI_FILE_PICKER_TYPES,
  ...PROJECT_FILE_PICKER_TYPES,
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
  | "toggle-metronome"
  | "toggle-clap"
  | "project"
  | "settings"
  | "open-audio"
  | "refresh-audio"
  | "select-audio-folder"
  | "toggle-debug"
  | "close-debug"
  | "close-project"
  | "close-settings";

export interface ActiveDocument {
  midiData: Midi | null;
  fileName: string | null;
  fileHandle: FileSystemFileHandle | null;
  document: ProjectDocument | null;
}

export type CommandAvailability = Record<EditorCommandId, boolean>;

export interface EditorCommandContextValue {
  activeDocument: ActiveDocument;
  isDirty: boolean;
  error: string | null;
  debugVisible: boolean;
  projectVisible: boolean;
  settingsVisible: boolean;
  canExecute: CommandAvailability;
  audioDirectoryName: string | null;
  audioDirectorySupported: boolean;
  listDiscoveredAudioFileNames: () => Promise<string[] | null>;
  dispatch: (command: EditorCommandId) => Promise<void>;
  markDirty: () => void;
  /** Applies validated project.json metadata without exposing archive details to UI. */
  applyProjectMetadata: (
    metadata: unknown,
  ) => readonly ProjectValidationIssue[];
  clearError: () => void;
}

interface EditorCommandProviderProps {
  children: ReactNode;
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

function hasExtension(fileName: string, extensions: string[]): boolean {
  const name = fileName.toLowerCase();
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
    projectMetadata,
    setProjectMetadata,
  } = useEditor();
  const {
    setAudio,
    setAudioSource,
    setAudioFileName,
    toggleMetronome,
    toggleClap,
  } = usePlayback();
  const { settings } = useApplicationSettings();
  const audioFileRef = useRef<HTMLInputElement>(null);
  const audioLoadRef = useRef(0);
  const audioUrlRef = useRef<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugVisible, setDebugVisible] = useState(false);
  const [projectVisible, setProjectVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [audioDirectoryHandle, setAudioDirectoryHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const audioDirectorySupported = supportsDirectoryPicker();

  useEffect(() => {
    void loadAudioDirectoryHandle().then(setAudioDirectoryHandle);
  }, []);

  const projectDocument = useMemo<ProjectDocument | null>(
    () =>
      midiData
        ? createProjectDocument(
            midiData,
            projectMetadata,
            { fileName, fileHandle },
            isDirty,
          )
        : null,
    [fileHandle, fileName, isDirty, midiData, projectMetadata],
  );

  const activeDocument = useMemo<ActiveDocument>(
    () => ({ midiData, fileName, fileHandle, document: projectDocument }),
    [fileHandle, fileName, midiData, projectDocument],
  );

  const canSave = midiData!.trackCount !== 0 || false;
  const canExecute = useMemo<CommandAvailability>(
    () => ({
      new: true,
      open: true,
      save: canSave,
      "save-as": canSave,
      export: canSave,
      "toggle-metronome": true,
      "toggle-clap": true,
      project: true,
      settings: true,
      "open-audio": true,
      "refresh-audio": !settings.audio.multitrack,
      "select-audio-folder":
        audioDirectorySupported && !settings.audio.multitrack,
      "toggle-debug": true,
      "close-debug": debugVisible,
      "close-project": projectVisible,
      "close-settings": settingsVisible,
    }),
    [
      canSave,
      debugVisible,
      projectVisible,
      settingsVisible,
      settings.audio.multitrack,
      audioDirectorySupported,
    ],
  );

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  const applyProjectMetadata = useCallback(
    (metadata: unknown): readonly ProjectValidationIssue[] => {
      try {
        setProjectMetadata(validateProjectMetadata(metadata));
        setIsDirty(true);
        setError(null);
        return [];
      } catch (validationError) {
        const issues =
          validationError instanceof ProjectValidationError
            ? validationError.issues
            : [
                {
                  path: "$",
                  message: errorMessage(
                    validationError,
                    "Project metadata is invalid.",
                  ),
                },
              ];
        setError(
          issues.map((item) => `${item.path}: ${item.message}`).join("\n"),
        );
        return issues;
      }
    },
    [setProjectMetadata],
  );

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
    ({
      name,
      bytes,
      handle,
    }: {
      name: string;
      bytes: Uint8Array;
      handle: FileSystemFileHandle | null;
    }): void => {
      if (!hasExtension(name, [".mid", ".midi"])) {
        throw new Error("Choose a MIDI file (.mid or .midi).");
      }

      const parsed = new Midi(bytes);
      setMidiData(parsed);
      setProjectMetadata(createProjectMetadata(name.replace(/\.midi?$/i, "")));
      setFileName(name);
      setFileHandle(handle);
      setIsDirty(false);
      setError(null);
    },
    [setFileHandle, setFileName, setMidiData, setProjectMetadata],
  );

  const loadAudio = useCallback(
    ({ file }: { file: File }): void => {
      if (!hasExtension(file.name, [".wav"])) {
        throw new Error("Choose a WAV audio file (.wav).");
      }

      const url = URL.createObjectURL(file);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = url;
      const player = Audio({ file: url, preload: true });
      setAudio(player);
      setAudioSource(
        { role: "single", fileName: file.name, url, enabled: true, volume: 1 },
        player,
      );
      setAudioFileName(file.name);
      setError(null);
    },
    [setAudio, setAudioFileName, setAudioSource],
  );

  const discoverAudio = useCallback(
    async (options?: { reportMissing?: boolean }): Promise<void> => {
      if (settings.audio.multitrack) {
        const regexes = {
          lead: settings.discovery.leadRegex,
          rhythm: settings.discovery.rhythmRegex,
          bass: settings.discovery.bassRegex,
          drums: settings.discovery.drumsRegex,
          vocals: settings.discovery.vocalsRegex,
          harmonies: settings.discovery.harmoniesRegex,
          synth: settings.discovery.synthRegex,
          other: settings.discovery.otherRegex,
        } as const;
        const discovered = isTauri()
          ? await discoverMultitrackAudio(settings.audio.rootPath, regexes)
          : audioDirectoryHandle &&
              (await hasReadPermission(audioDirectoryHandle))
            ? await discoverMultitrackAudioFromHandle(
                audioDirectoryHandle,
                regexes,
              )
            : null;
        if (discovered) {
          for (const [role, source] of Object.entries(discovered.matches)) {
            if (source)
              setAudioSource({
                role: role as keyof typeof regexes,
                fileName: source.name,
                url: source.url,
                enabled: true,
                volume: 1,
              });
          }
          const ambiguous = Object.entries(discovered.ambiguous).filter(
            ([, names]) => names?.length,
          );
          if (
            options?.reportMissing &&
            (discovered.missing.length || ambiguous.length)
          ) {
            setError(
              `Audio roles unresolved: ${[...discovered.missing, ...ambiguous.map(([role]) => role)].join(", ")}`,
            );
          }
        }
        return;
      }

      try {
        const discovered = isTauri()
          ? await discoverSongAudio(
              settings.audio.rootPath,
              settings.discovery.songRegex,
            )
          : audioDirectoryHandle &&
              (await hasReadPermission(audioDirectoryHandle))
            ? await discoverSongAudioFromHandle(
                audioDirectoryHandle,
                settings.discovery.songRegex,
              )
            : null;

        if (discovered) {
          const player = Audio({ file: discovered.url, preload: true });
          setAudio(player);
          setAudioSource(
            {
              role: "single",
              fileName: discovered.name,
              url: discovered.url,
              enabled: true,
              volume: 1,
            },
            player,
          );
          setAudioFileName(discovered.name);
          setError(null);
        } else if (options?.reportMissing) {
          setError("No matching audio file was found at the audio path.");
        }
      } catch (discoverError: unknown) {
        if (options?.reportMissing) {
          setError(
            errorMessage(discoverError, "Failed to scan the audio path."),
          );
        } else {
          console.warn("Automatic audio discovery failed:", discoverError);
        }
      }
    },
    [
      audioDirectoryHandle,
      setAudio,
      setAudioSource,
      setAudioFileName,
      settings.audio.multitrack,
      settings.audio.rootPath,
      settings.discovery.songRegex,
      settings.discovery.leadRegex,
      settings.discovery.rhythmRegex,
      settings.discovery.bassRegex,
      settings.discovery.drumsRegex,
      settings.discovery.vocalsRegex,
      settings.discovery.harmoniesRegex,
      settings.discovery.synthRegex,
      settings.discovery.otherRegex,
    ],
  );

  useEffect(() => {
    // Async discovery; state is set after the awaited scan, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void discoverAudio();
  }, [discoverAudio]);

  const listDiscoveredAudioFileNames = useCallback(async (): Promise<
    string[] | null
  > => {
    try {
      if (isTauri()) {
        return await listAudioFileNames(settings.audio.rootPath);
      }
      if (
        audioDirectoryHandle &&
        (await hasReadPermission(audioDirectoryHandle))
      ) {
        return await listAudioFileNamesFromHandle(audioDirectoryHandle);
      }
      return null;
    } catch (listError: unknown) {
      console.warn("Could not list audio files:", listError);
      return null;
    }
  }, [audioDirectoryHandle, settings.audio.rootPath]);

  const selectAudioFolder = useCallback(async (): Promise<void> => {
    const handle = await window.showDirectoryPicker!({ mode: "read" });
    const granted = await requestReadPermission(handle);
    if (!granted) {
      throw new Error("Permission to read the selected folder was denied.");
    }
    await saveAudioDirectoryHandle(handle);
    setAudioDirectoryHandle(handle);
  }, []);

  // Audio still needs the browser File object for ts-audio. Document files use
  // the target-neutral project file service above.
  const openAudioPicker = useCallback(
    (
      types: FilePickerAcceptType[],
      fallbackInput: RefObject<HTMLInputElement | null>,
    ): void => {
      if (typeof window.showOpenFilePicker === "function") {
        void window
          .showOpenFilePicker({ types })
          .then(async ([handle]) => {
            const file = await handle.getFile();
            loadAudio({ file });
          })
          .catch((loadError: unknown) => {
            if (!isAbortError(loadError))
              setError(errorMessage(loadError, "Failed to open audio file."));
          });
        return;
      }
      fallbackInput.current?.click();
    },
    [loadAudio],
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
        .then(() => {
          if (requestId !== audioLoadRef.current) {
            return;
          }
          loadAudio({ file });
        })
        .catch((loadError: unknown) => {
          if (requestId === audioLoadRef.current) {
            setError(errorMessage(loadError, "Failed to open audio file."));
          }
        });
    },
    [loadAudio],
  );

  const loadProject = useCallback(
    async ({
      name,
      bytes,
      handle,
    }: {
      name: string;
      bytes: Uint8Array;
      handle: FileSystemFileHandle | null;
    }): Promise<void> => {
      const document = await deserializeProject(bytes, {
        fileName: name,
        fileHandle: handle,
      });
      setMidiData(document.midi);
      setProjectMetadata(document.metadata);
      setFileName(name);
      setFileHandle(handle);
      setIsDirty(false);
    },
    [setFileHandle, setFileName, setMidiData, setProjectMetadata],
  );

  const saveAs = useCallback(async (): Promise<void> => {
    if (!canSave || !projectDocument)
      throw new Error("There is no MIDI document to save.");
    const saveAsProject = settings.saving.defaultSaveMode === "project";
    const exportResult = saveAsProject
      ? null
      : exportProjectMidi(projectDocument);
    const suggestedName = saveAsProject
      ? `${(fileName ?? projectMetadata.Song.Name ?? "untitled").replace(/\.(midproject|midi?)$/i, "")}.midproject`
      : exportResult!.suggestedName;
    const bytes = saveAsProject
      ? await serializeProject(projectDocument)
      : exportResult!.bytes;
    const saved = await saveBytes(
      bytes,
      suggestedName,
      saveAsProject ? PROJECT_FILE_PICKER_TYPES : MIDI_FILE_PICKER_TYPES,
      saveAsProject ? "application/zip" : "audio/midi",
    );
    setFileHandle(saved.handle);
    setFileName(saved.name);
    setIsDirty(false);
  }, [
    canSave,
    fileName,
    projectDocument,
    projectMetadata.Song.Name,
    setFileHandle,
    setFileName,
    settings.saving.defaultSaveMode,
  ]);

  const save = useCallback(async (): Promise<void> => {
    if (!canSave || !projectDocument)
      throw new Error("There is no MIDI document to save.");
    if (!fileHandle) {
      await saveAs();
      return;
    }
    const saveAsMidi = hasExtension(fileName ?? fileHandle.name, [
      ".mid",
      ".midi",
    ]);
    const exportResult = saveAsMidi ? exportProjectMidi(projectDocument) : null;
    const bytes = saveAsMidi
      ? exportResult!.bytes
      : await serializeProject(projectDocument);
    const saved = await saveBytes(
      bytes,
      fileHandle.name,
      saveAsMidi ? MIDI_FILE_PICKER_TYPES : PROJECT_FILE_PICKER_TYPES,
      saveAsMidi ? "audio/midi" : "application/zip",
      fileHandle,
    );
    setFileName(saved.name);
    setIsDirty(false);
  }, [canSave, fileHandle, fileName, projectDocument, saveAs, setFileName]);

  const exportMidi = useCallback(async (): Promise<void> => {
    if (!canSave || !projectDocument)
      throw new Error("There is no MIDI document to export.");
    const result = exportProjectMidi(projectDocument);
    await saveBytes(
      result.bytes,
      result.suggestedName,
      MIDI_FILE_PICKER_TYPES,
      "audio/midi",
    );
  }, [canSave, projectDocument]);

  const openDocument = useCallback(async (): Promise<void> => {
    const opened = await openFile(OPEN_DOCUMENT_FILE_PICKER_TYPES);
    if (!opened) return;
    if (hasExtension(opened.name, [".midproject"])) {
      await loadProject(opened);
    } else {
      loadMidi(opened);
    }
  }, [loadMidi, loadProject]);

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
            setProjectMetadata(createProjectMetadata());
            setFileName(null);
            setFileHandle(null);
            setIsDirty(false);
            return;
          case "open":
            if (!canDiscardChanges()) {
              return;
            }
            await openDocument();
            return;
          case "save":
            await save();
            return;
          case "save-as":
            await saveAs();
            return;
          case "export":
            await exportMidi();
            return;
          case "toggle-metronome":
            toggleMetronome();
            return;
          case "toggle-clap":
            toggleClap();
            return;
          case "project":
            setProjectVisible(true);
            return;
          case "settings":
            setSettingsVisible(true);
            return;
          case "open-audio":
            openAudioPicker(WAV_FILE_PICKER_TYPES, audioFileRef);
            return;
          case "refresh-audio":
            await discoverAudio({ reportMissing: true });
            return;
          case "select-audio-folder":
            await selectAudioFolder();
            await discoverAudio({ reportMissing: true });
            return;
          case "toggle-debug":
            setDebugVisible((visible) => !visible);
            return;
          case "close-debug":
            setDebugVisible(false);
            return;
          case "close-project":
            setProjectVisible(false);
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
      discoverAudio,
      exportMidi,
      loadAudio,
      openAudioPicker,
      openDocument,
      save,
      saveAs,
      selectAudioFolder,
      setFileHandle,
      setFileName,
      setMidiData,
      setProjectMetadata,
      toggleClap,
      toggleMetronome,
    ],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isTypingTarget(event.target)) {
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const key = event.key.toLowerCase();
        const command: EditorCommandId | null =
          key === "m" ? "toggle-metronome" : key === "n" ? "toggle-clap" : null;
        if (command) {
          event.preventDefault();
          void dispatch(command);
        }
        return;
      }

      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      let command: EditorCommandId | null = null;
      switch (key) {
        case ",":
          command = "settings";
          break;
        case "o":
          command = "open";
          break;
        case "s":
          command = event.shiftKey ? "save-as" : "save";
          break;
      }

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
      projectVisible,
      settingsVisible,
      canExecute,
      audioDirectoryName: audioDirectoryHandle?.name ?? null,
      audioDirectorySupported,
      listDiscoveredAudioFileNames,
      dispatch,
      markDirty,
      applyProjectMetadata,
      clearError,
    }),
    [
      activeDocument,
      applyProjectMetadata,
      audioDirectoryHandle,
      audioDirectorySupported,
      canExecute,
      clearError,
      debugVisible,
      projectVisible,
      dispatch,
      error,
      isDirty,
      listDiscoveredAudioFileNames,
      markDirty,
      settingsVisible,
    ],
  );

  return (
    <EditorCommandContext.Provider value={value}>
      {children}
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
