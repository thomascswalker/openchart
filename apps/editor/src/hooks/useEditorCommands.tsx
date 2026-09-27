import type { Midi } from "@midiedit/core";
import { isTauri } from "@tauri-apps/api/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useApplicationSettings } from "../context/ApplicationSettingsContext";
import { useEditor } from "../context/EditorContext";
import { usePlayback } from "../context/PlaybackContextStore";
import {
  listAudioFileNames,
  listAudioFileNamesFromHandle,
} from "../util/audioDiscovery";
import {
  hasReadPermission,
  loadAudioDirectoryHandle,
  supportsDirectoryPicker,
} from "../util/audioDirectoryHandle";
import {
  createProjectDocument,
  type ProjectDocument,
} from "../project/projectService";
import {
  ProjectValidationError,
  type ProjectValidationIssue,
  validateProjectMetadata,
} from "../project/projectMetadata";
import { executeExportMidi } from "../commands/exportMidi";
import { executeNewFile as executeNewFile } from "../commands/newFile";
import { executeOpenFile } from "../commands/openFile";
import { executeOpenAudio, handleAudioFileLoad } from "../commands/openAudio";
import { discoverAudio, executeRefreshAudio } from "../commands/refreshAudio";
import { executeSaveFile } from "../commands/saveFile";
import { executeSaveFileAs } from "../commands/saveFileAs";
import { executeSelectAudioFolder } from "../commands/selectAudioFolder";
import type {
  AudioCommandContext,
  EditorCommandContext as CommandExecutionContext,
  EditorCommandCallback,
  EditorCommandId,
} from "../commands/command";

export type { EditorCommandId } from "../commands/command";

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

const commandExecutors: Record<EditorCommandId, EditorCommandCallback> = {
  new: executeNewFile,
  open: executeOpenFile,
  save: executeSaveFile,
  saveAs: executeSaveFileAs,
  export: executeExportMidi,
  openAudio: executeOpenAudio,
  refreshAudio: executeRefreshAudio,
  selectAudioFolder: executeSelectAudioFolder,
  toggleMetronome: (context) => context.toggleMetronome(),
  toggleClap: (context) => context.toggleClap(),
  openDebugSettings: (context) => context.setDebugVisible(true),
  closeDebugSettings: (context) => context.setDebugVisible(false),
  openProjectSettings: (context) => context.setProjectVisible(true),
  closeProjectSettings: (context) => context.setProjectVisible(false),
  openSettings: (context) => context.setSettingsVisible(true),
  closeSettings: (context) => context.setSettingsVisible(false),
};

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
      saveAs: canSave,
      export: canSave,
      toggleMetronome: true,
      toggleClap: true,
      openProjectSettings: true,
      openSettings: true,
      openAudio: true,
      refreshAudio: !settings.audio.multitrack,
      selectAudioFolder: audioDirectorySupported && !settings.audio.multitrack,
      openDebugSettings: !debugVisible,
      closeDebugSettings: debugVisible,
      closeProjectSettings: projectVisible,
      closeSettings: settingsVisible,
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

  const audioCommandContext = useMemo<AudioCommandContext>(
    () => ({
      settings,
      audioDirectoryHandle,
      setAudioDirectoryHandle,
      setError,
      setAudio,
      setAudioSource,
      setAudioFileName,
      audioFileRef,
      audioLoadRef,
      audioUrlRef,
    }),
    [
      audioDirectoryHandle,
      setAudio,
      setAudioFileName,
      setAudioSource,
      settings,
    ],
  );

  useEffect(() => {
    // Async discovery; state is set after the awaited scan, not synchronously.
    void discoverAudio(audioCommandContext);
  }, [audioCommandContext]);

  const commandContext = useMemo<CommandExecutionContext>(
    () => ({
      ...audioCommandContext,
      midiData,
      projectDocument,
      projectMetadata,
      fileName,
      fileHandle,
      isDirty,
      setMidiData,
      setProjectMetadata,
      setFileName,
      setFileHandle,
      setIsDirty,
      toggleMetronome,
      toggleClap,
      setProjectVisible,
      setSettingsVisible,
      setDebugVisible,
    }),
    [
      audioCommandContext,
      fileHandle,
      fileName,
      isDirty,
      midiData,
      projectDocument,
      projectMetadata,
      setFileHandle,
      setFileName,
      setMidiData,
      setProjectMetadata,
      toggleClap,
      toggleMetronome,
    ],
  );

  const dispatch = useCallback(
    async (command: EditorCommandId): Promise<void> => {
      setError(null);

      if (!canExecute[command]) {
        setError("This command is not available for the active document.");
        return;
      }

      try {
        await commandExecutors[command](commandContext);
      } catch (commandError: unknown) {
        if (!isAbortError(commandError)) {
          setError(
            errorMessage(commandError, "The command could not be completed."),
          );
        }
      }
    },
    [canExecute, commandContext],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isTypingTarget(event.target)) {
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const key = event.key.toLowerCase();
        const command: EditorCommandId | null =
          key === "m" ? "toggleMetronome" : key === "n" ? "toggleClap" : null;
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
          command = "openSettings";
          break;
        case "o":
          command = "open";
          break;
        case "s":
          command = event.shiftKey ? "saveAs" : "save";
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
        onChange={(event) => handleAudioFileLoad(event, audioCommandContext)}
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
