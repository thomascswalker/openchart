import { Midi } from "@midiedit/core";
import { createContext, useContext, useState } from "react";

// Define the shape of our global state
interface MidiContextType {
  midiData: Midi | null;
  setMidiData: (data: Midi) => void;
  fileName: string | null;
  setFileName: (name: string | null) => void;
  // Handle to the file's on-disk location; doubles as the "save path" for plain Save.
  fileHandle: FileSystemFileHandle | null;
  setFileHandle: (handle: FileSystemFileHandle | null) => void;
}

// Create the context with an undefined default value
const MidiContext = createContext<MidiContextType | undefined>(undefined);

// Provide the context to the app component tree
export function MidiProvider({ children }: { children: React.ReactNode }) {
  const [midiData, setMidiData] = useState<Midi>(new Midi());
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(
    null,
  );

  return (
    <MidiContext.Provider
      value={{
        midiData,
        setMidiData,
        fileName,
        setFileName,
        fileHandle,
        setFileHandle,
      }}
    >
      {children}
    </MidiContext.Provider>
  );
}

// Custom hook to safely consume the MIDI context
export function useMidi() {
  const context = useContext(MidiContext);
  if (!context) {
    throw new Error("useMidi must be used within a MidiProvider");
  }
  return context;
}
