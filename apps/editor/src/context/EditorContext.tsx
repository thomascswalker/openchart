import { Midi } from "@midiedit/core";
import { Difficulty } from "@midiedit/views";
import { createContext, useContext, useState } from "react";
import {
  createProjectMetadata,
  type ProjectMetadata,
} from "../project/projectMetadata";
import { CHART_VIEWS } from "../components/views/ChartViews";
import type { ProviderProps } from "./shared";

export type ViewportKind = "piano-roll" | "highway";

export interface ViewportCameraState {
  tick: number;
  pianoRoll?: unknown;
  highway?: unknown;
}

export interface ViewportSession {
  id: string;
  view: ViewportKind;
  trackKey: string;
  instrument: string;
  difficulty: Difficulty;
  camera: ViewportCameraState;
}

const DEFAULT_VIEWPORT_ID = "viewport-1";
const DEFAULT_TRACK_KEY = "lead-guitar";

function createViewportSession(
  id: string,
  view: ViewportKind = "piano-roll",
): ViewportSession {
  return {
    id,
    view,
    trackKey: DEFAULT_TRACK_KEY,
    instrument: "LEAD GUITAR",
    difficulty: Difficulty.Expert,
    camera: { tick: 0 },
  };
}

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

  activeViewId: string;
  setActiveViewId: (id: string) => void;

  snapEnabled: boolean;
  setSnapEnabled: (enabled: boolean) => void;

  snapDenominator: number;
  setSnapDenominator: (denominator: number) => void;

  viewportSessions: readonly ViewportSession[];
  activeViewportId: string;
  maxViewportCount: number;
  setMaxViewportCount: (count: number) => void;
  addViewport: (view: ViewportKind, afterId?: string) => string | null;
  closeViewport: (id: string) => boolean;
  focusViewport: (id: string) => void;
  updateViewport: (
    id: string,
    update: Partial<Omit<ViewportSession, "id">>,
  ) => void;
  getViewport: (id: string) => ViewportSession | undefined;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: ProviderProps) {
  const [midiData, setMidiData] = useState<Midi | null>(new Midi());
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
  const [activeViewId, setActiveViewId] = useState(CHART_VIEWS[0].id);
  const [viewportSessions, setViewportSessions] = useState<ViewportSession[]>([
    createViewportSession(DEFAULT_VIEWPORT_ID),
  ]);
  const [activeViewportId, setActiveViewportId] = useState(DEFAULT_VIEWPORT_ID);
  const [maxViewportCount, setMaxViewportCountState] = useState(4);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapDenominator, setSnapDenominator] = useState(4);

  const handleMidiDataChanged = (data: Midi) => {
    setMidiData(data);
    setTrackCount(data.tracks.length);
  };

  const setMaxViewportCount = (count: number): void => {
    const next = Math.max(1, Math.min(4, Math.floor(count)));
    setMaxViewportCountState(next);
    setViewportSessions((sessions) => {
      const remaining = sessions.slice(0, next);
      if (!remaining.some((session) => session.id === activeViewportId)) {
        setActiveViewportId(remaining[0]?.id ?? DEFAULT_VIEWPORT_ID);
      }
      return remaining;
    });
  };

  const addViewport = (view: ViewportKind, afterId?: string): string | null => {
    if (viewportSessions.length >= maxViewportCount) return null;
    const created = `viewport-${Date.now()}-${viewportSessions.length + 1}`;
    setViewportSessions((sessions) => {
      if (sessions.length >= maxViewportCount) return sessions;
      const afterIndex = sessions.findIndex(
        (session) => session.id === afterId,
      );
      const insertAt = afterIndex < 0 ? sessions.length : afterIndex + 1;
      return [
        ...sessions.slice(0, insertAt),
        createViewportSession(created, view),
        ...sessions.slice(insertAt),
      ];
    });
    setActiveViewportId(created);
    return created;
  };

  const closeViewport = (id: string): boolean => {
    let closed = false;
    setViewportSessions((sessions) => {
      if (
        sessions.length <= 1 ||
        !sessions.some((session) => session.id === id)
      ) {
        return sessions;
      }
      closed = true;
      const remaining = sessions.filter((session) => session.id !== id);
      if (activeViewportId === id) setActiveViewportId(remaining[0].id);
      return remaining;
    });
    return closed;
  };

  const focusViewport = (id: string): void => {
    setActiveViewportId(id);
    const session = viewportSessions.find((item) => item.id === id);
    if (session) setActiveViewId(session.view);
  };

  const updateViewport = (
    id: string,
    update: Partial<Omit<ViewportSession, "id">>,
  ): void => {
    setViewportSessions((sessions) =>
      sessions.map((session) =>
        session.id === id
          ? {
              ...session,
              ...update,
              camera: update.camera
                ? { ...session.camera, ...update.camera }
                : session.camera,
            }
          : session,
      ),
    );
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
        activeViewId,
        setActiveViewId,
        snapEnabled,
        setSnapEnabled,
        snapDenominator,
        setSnapDenominator,
        viewportSessions,
        activeViewportId,
        maxViewportCount,
        setMaxViewportCount,
        addViewport,
        closeViewport,
        focusViewport,
        updateViewport,
        getViewport: (id) => viewportSessions.find((item) => item.id === id),
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
