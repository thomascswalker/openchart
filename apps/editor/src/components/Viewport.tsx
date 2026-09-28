import { useCallback, useEffect, useRef } from "react";
import { useState } from "react";
import type { Midi } from "@midiedit/core";
import { Difficulty, InstrumentType, SongView } from "@midiedit/views";
import { useEditor, type ViewportSession } from "../context/EditorContext";
import { usePlayback } from "../context/PlaybackContextStore";
import { useEditorCommands } from "../hooks/useEditorCommands";
import { Timeline } from "./Timeline";
import { ChartViewHost } from "./views/ChartViewHost";
import { CHART_VIEWS } from "./views/ChartViews";
import type { ChartView } from "./views/ChartViews";
import {
  HighwayView,
  type DrumPlacementKind,
  type HighwayMode,
} from "./views/highway";
import { getCameraTickForPlayhead } from "./views/viewNavigation";
import { TrackList } from "./Tracklist";
import Toolbar from "./views/Toolbar";
import { Button, CloseButton } from "./shared/Button/Button";
import { startCase } from "es-toolkit";
import {
  BassIcon,
  DrumsIcon,
  GuitarIcon,
  NoteIcon,
  PianoIcon,
  SplitIcon,
  VocalsIcon,
} from "./shared/Icon/Icon";

function InstrumentIcon({ instrument }: { instrument: string }) {
  switch (instrument) {
    case InstrumentType.Lead:
      return <GuitarIcon width={18} height={18} />;
    case InstrumentType.Groove:
    case InstrumentType.Bass:
      return <BassIcon width={18} height={18} />;
    case InstrumentType.Drums:
      return <DrumsIcon width={18} height={18} />;
    case InstrumentType.Vocals:
    case InstrumentType.Harmonies:
      return <VocalsIcon width={18} height={18} />;
    case InstrumentType.Synth:
      return <PianoIcon width={18} height={18} />;
    default:
      return <NoteIcon width={18} height={18} />;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
      target.isContentEditable)
  );
}

function trackIndexForSession(
  midi: Midi,
  session: ViewportSession,
): number | null {
  if (session.trackKey.startsWith("unmapped-")) {
    const names = new Set([
      "CHART HEADER",
      ...new SongView(midi)
        .getTrackDescriptors()
        .map((descriptor) => descriptor.name),
    ]);
    const tracks = midi.tracks.filter((track) => !names.has(track.name));
    const index = Number(session.trackKey.slice("unmapped-".length));
    const selected = tracks[index];
    return selected ? midi.tracks.indexOf(selected) : null;
  }
  const index = midi.tracks.findIndex(
    (track) => track.name === session.instrument,
  );
  return index >= 0 ? index : null;
}

interface ViewportProps {
  onChartViewReady: (view: ChartView | null) => void;
}

export const Viewport = ({ onChartViewReady }: ViewportProps) => {
  const { viewportSessions, activeViewportId, maxViewportCount } = useEditor();
  return (
    <section className="viewport-manager" aria-label="Chart viewports">
      <div className="viewport-manager__toolbar">
        <strong>Viewports</strong>
        <span>
          {viewportSessions.length}/{maxViewportCount}
        </span>
      </div>
      <div
        className={`viewport-grid viewport-grid--${viewportSessions.length}`}
      >
        {viewportSessions.map((session) => (
          <ViewportPanel
            key={session.id}
            session={session}
            active={session.id === activeViewportId}
            onChartViewReady={
              session.id === activeViewportId ? onChartViewReady : () => {}
            }
          />
        ))}
      </div>
    </section>
  );
};

function ViewportPanel({
  session,
  active,
  onChartViewReady,
}: {
  session: ViewportSession;
  active: boolean;
  onChartViewReady: (view: ChartView | null) => void;
}) {
  const {
    midiData,
    viewportSessions,
    maxViewportCount,
    updateViewport,
    addViewport,
    closeViewport,
    focusViewport,
    snapEnabled,
    snapDenominator,
    setSnapDenominator,
    beginMidiEdit,
    recordMidiEdit,
    endMidiEdit,
  } = useEditor();
  const {
    isPlaying,
    playbackTick: playheadTick,
    setPlaybackTick,
    refresh: refreshTotalTicks,
    togglePlay,
    setActiveView,
    stopPreview,
  } = usePlayback();
  const { markDirty } = useEditorCommands();
  const chartViewRef = useRef<ChartView | null>(null);
  const [chartView, setChartView] = useState<ChartView | null>(null);
  const [highwayMode, setHighwayMode] = useState<HighwayMode>("select");
  const [drumPlacementKind, setDrumPlacementKind] =
    useState<DrumPlacementKind>("pad");
  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;
  const activeView =
    CHART_VIEWS.find((view) => view.id === session.view) ?? CHART_VIEWS[0];
  const selectedTrackIndex = midiData
    ? trackIndexForSession(midiData, session)
    : null;

  const keepPlayheadVisible = useCallback(
    (view: ChartView) => {
      const cameraTick =
        view instanceof HighwayView
          ? view.getCameraTickForPlayhead(playheadTick)
          : getCameraTickForPlayhead(
              playheadTick,
              view.getCameraTick(),
              view.getVisibleTickSpan(),
            );
      if (cameraTick !== null) view.setCameraTick(cameraTick);
    },
    [playheadTick],
  );

  const handleReady = useCallback(
    (view: ChartView | null) => {
      chartViewRef.current = view;
      setChartView(view);
      if (view) {
        view.setPlayheadTick(playheadTick);
        if (session.camera.tick) view.setCameraTick(session.camera.tick);
        keepPlayheadVisible(view);
      }
      onChartViewReady(view);
    },
    [keepPlayheadVisible, onChartViewReady, playheadTick, session.camera.tick],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTypingTarget(event.target)
      )
        return;
      if (active && session.view === "highway") {
        const key = event.key.toLowerCase();
        const mode =
          key === "q"
            ? "select"
            : key === "w"
              ? "place"
              : key === "e"
                ? "remove"
                : key === "r"
                  ? "stagepower"
                  : key === "t"
                    ? "solo"
                    : null;
        if (mode) {
          event.preventDefault();
          setHighwayMode((current) =>
            current === mode && (mode === "stagepower" || mode === "solo")
              ? "select"
              : mode,
          );
          return;
        }
      }
      if (event.code === "Space" && active) {
        event.preventDefault();
        togglePlayRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, session.view]);

  useEffect(() => {
    chartViewRef.current?.setPlayheadTick(playheadTick);
  }, [playheadTick]);

  useEffect(() => {
    const view = chartViewRef.current;
    if (!view) return;
    view.onNotesChanged = () => {
      recordMidiEdit();
      markDirty();
      refreshTotalTicks();
    };
    view.onEditStart = beginMidiEdit;
    view.onEditEnd = endMidiEdit;
    view.onSeekRequest = setPlaybackTick;
    view.onSnapDenominatorChange = setSnapDenominator;
    view.onCameraChange = () =>
      updateViewport(session.id, { camera: { tick: view.getCameraTick() } });
    return () => {
      view.onNotesChanged = null;
      view.onEditStart = null;
      view.onEditEnd = null;
      view.onSeekRequest = null;
      view.onSnapDenominatorChange = null;
      view.onCameraChange = null;
    };
  }, [
    markDirty,
    recordMidiEdit,
    beginMidiEdit,
    endMidiEdit,
    refreshTotalTicks,
    session.id,
    setSnapDenominator,
    setPlaybackTick,
    updateViewport,
  ]);

  useEffect(() => {
    if (active) onChartViewReady(chartView);
  }, [active, chartView, onChartViewReady]);

  useEffect(() => {
    if (chartView instanceof HighwayView) {
      chartView.setMode(highwayMode);
    }
  }, [chartView, highwayMode]);

  useEffect(() => {
    if (chartView instanceof HighwayView) {
      chartView.setDrumPlacementKind(drumPlacementKind);
    }
  }, [chartView, drumPlacementKind]);

  useEffect(() => {
    if (isPlaying && chartViewRef.current)
      keepPlayheadVisible(chartViewRef.current);
  }, [isPlaying, keepPlayheadVisible]);

  useEffect(() => {
    if (!active) return;
    setActiveView(session.view);
    stopPreview();
  }, [active, session.view, setActiveView, stopPreview]);

  const setView = (view: ViewportSession["view"]) => {
    focusViewport(session.id);
    updateViewport(session.id, { view, camera: { tick: playheadTick } });
  };
  return (
    <article
      className={`viewport-panel${active ? " viewport-panel--active" : ""}`}
      onPointerDown={() => focusViewport(session.id)}
    >
      <header className="viewport-panel__header">
        <p className="viewport-panel__title">
          <span className="viewport-panel__title-icon" aria-hidden="true">
            <InstrumentIcon instrument={session.instrument} />
          </span>
          <span className="viewport-panel__title-text">
            {session.view === "piano-roll"
              ? session.instrument
              : `${startCase(session.instrument)} (${Difficulty[session.difficulty]})`}
          </span>
        </p>
        <div className="viewport-panel__actions">
          <Button
            title="Split to the right"
            aria-label={`Split ${session.view === "piano-roll" ? "Piano Roll" : "Highway"} to the right`}
            onClick={() => addViewport(session.view, session.id)}
            disabled={viewportSessions.length >= maxViewportCount}
            flat={true}
            minWidth="24px"
            minHeight="24px"
            maxWidth="24px"
            maxHeight="24px"
            padding={"2px"}
            borderRadius={4}
          >
            <SplitIcon />
          </Button>
          <CloseButton
            onClick={() => closeViewport(session.id)}
            disabled={viewportSessions.length <= 1}
          />
        </div>
      </header>
      <Toolbar
        session={session}
        onViewChange={setView}
        highwayMode={highwayMode}
        onHighwayModeChange={setHighwayMode}
        drumPlacementKind={drumPlacementKind}
        onDrumPlacementKindChange={setDrumPlacementKind}
      />
      <div className="viewport-panel__body">
        {session.view === "piano-roll" ? (
          <TrackList viewportId={session.id} />
        ) : null}
        <div className="viewport-panel__renderer">
          <ChartViewHost
            createRenderer={activeView.createRenderer}
            state={{
              midi: midiData,
              selectedTrackIndex,
              selectedInstrument: session.instrument,
              selectedDifficulty: session.difficulty,
              snap: { enabled: snapEnabled, denominator: snapDenominator },
              isPlaying,
            }}
            onReady={handleReady}
          />
        </div>
      </div>
      <Timeline chartView={chartView} midiData={midiData} />
    </article>
  );
}
