import { Midi } from "@midiedit/core";
import { createContext, useContext, useState } from "react";

// Define the shape of our global state
interface EditorContextType {
  midiData: Midi | null;
  setMidiData: (data: Midi) => void;

  fileName: string | null;
  setFileName: (name: string | null) => void;

  fileHandle: FileSystemFileHandle | null;
  setFileHandle: (handle: FileSystemFileHandle | null) => void;

  trackCount: number;
  setTrackCount: (count: number) => void;

  selectedTrackIndex: number | null;
  setSelectedTrackIndex: (index: number | null) => void;
}

// Create the context with an undefined default value
const EditorContext = createContext<EditorContextType | undefined>(undefined);

// Provide the context to the app component tree
export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [midiData, setMidiData] = useState<Midi>(new Midi());
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(
    null,
  );
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number | null>(
    null,
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
        selectedTrackIndex,
        setSelectedTrackIndex,
        trackCount,
        setTrackCount,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

// Custom hook to safely consume the Editor context
export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used within a EditorProvider");
  }
  return context;
}
