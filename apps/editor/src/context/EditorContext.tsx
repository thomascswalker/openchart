import { Midi } from "@midiedit/core";
import { Difficulty } from "@midiedit/views";
import { createContext, useContext, useState } from "react";
import {
  createProjectMetadata,
  type ProjectMetadata,
} from "../project/projectMetadata";
import type { ProviderProps } from "./shared";

// Define the shape of our global state
interface EditorContextType {
  midiData: Midi | null;
  setMidiData: (data: Midi) => void;

  fileName: string | null;
  setFileName: (name: string | null) => void;

  fileHandle: FileSystemFileHandle | null;
  setFileHandle: (handle: FileSystemFileHandle | null) => void;

  projectMetadata: ProjectMetadata;
  setProjectMetadata: (metadata: ProjectMetadata) => void;

  trackCount: number;
  setTrackCount: (count: number) => void;

  selectedTrackIndex: number | null;
  setSelectedTrackIndex: (index: number | null) => void;

  selectedInstrument: string;
  setSelectedInstrument: (instrument: string) => void;

  selectedDifficulty: Difficulty;
  setSelectedDifficulty: (difficulty: Difficulty) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: ProviderProps) {
  const [midiData, setMidiData] = useState<Midi>(new Midi());
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(
    null,
  );
  const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata>(() =>
    createProjectMetadata(),
  );
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number | null>(
    null,
  );
  const [selectedInstrument, setSelectedInstrument] = useState("LEAD GUITAR");
  const [selectedDifficulty, setSelectedDifficulty] = useState(
    Difficulty.Expert,
  );
  const [trackCount, setTrackCount] = useState<number>(0);

  const handleMidiDataChanged = (data: Midi) => {
    setMidiData(data);
    setTrackCount(data.tracks.length);
  };

  return (
    <EditorContext.Provider
      value={{
        midiData,
        setMidiData: handleMidiDataChanged,
        fileName,
        setFileName,
        fileHandle,
        setFileHandle,
        projectMetadata,
        setProjectMetadata,
        selectedTrackIndex,
        setSelectedTrackIndex,
        selectedInstrument,
        setSelectedInstrument,
        selectedDifficulty,
        setSelectedDifficulty,
        trackCount,
        setTrackCount,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used within a EditorProvider");
  }
  return context;
}
