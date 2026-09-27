import type { Midi } from "@midiedit/core";
import type { ApplicationSettings } from "../context/ApplicationSettingsContext";
import type { PlaybackContextType } from "../context/PlaybackContextStore";
import type { ProjectMetadata } from "../project/projectMetadata";
import type { ProjectDocument } from "../project/projectService";

export type EditorCommandId =
  | "new"
  | "open"
  | "save"
  | "saveAs"
  | "export"
  | "undo"
  | "redo"
  | "toggleMetronome"
  | "toggleClap"
  | "openProjectSettings"
  | "openSettings"
  | "openAudio"
  | "refreshAudio"
  | "selectAudioFolder"
  | "openDebugSettings"
  | "closeDebugSettings"
  | "closeProjectSettings"
  | "closeSettings";

export interface AudioCommandContext {
  settings: ApplicationSettings;
  audioDirectoryHandle: FileSystemDirectoryHandle | null;
  setAudioDirectoryHandle: (handle: FileSystemDirectoryHandle | null) => void;
  setError: (error: string | null) => void;
  setAudio: PlaybackContextType["setAudio"];
  setAudioSource: PlaybackContextType["setAudioSource"];
  setAudioFileName: PlaybackContextType["setAudioFileName"];
  audioFileRef: { current: HTMLInputElement | null };
  audioLoadRef: { current: number };
  audioUrlRef: { current: string | null };
}

export interface EditorCommandContext extends AudioCommandContext {
  midiData: Midi | null;
  undoMidiEdit: () => void;
  redoMidiEdit: () => void;
  projectDocument: ProjectDocument | null;
  projectMetadata: ProjectMetadata;
  fileName: string | null;
  fileHandle: FileSystemFileHandle | null;
  isDirty: boolean;
  setMidiData: (midi: Midi) => void;
  setProjectMetadata: (metadata: ProjectMetadata) => void;
  setFileName: (fileName: string | null) => void;
  setFileHandle: (fileHandle: FileSystemFileHandle | null) => void;
  setIsDirty: (isDirty: boolean) => void;
  toggleMetronome: () => void;
  toggleClap: () => void;
  setProjectVisible: (visible: boolean) => void;
  setSettingsVisible: (visible: boolean) => void;
  setDebugVisible: (visible: boolean | ((current: boolean) => boolean)) => void;
}

export type EditorCommandCallback = (
  context: EditorCommandContext,
) => void | Promise<void>;
