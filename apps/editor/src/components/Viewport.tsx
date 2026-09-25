import { useCallback, useEffect, useRef } from "react";
import { useState } from "react";
import type { Midi } from "@midiedit/core";
import { SongView } from "@midiedit/views";
import { useEditor, type ViewportSession } from "../context/EditorContext";
import { usePlayback } from "../context/PlaybackContextStore";
import { useEditorCommands } from "../commands/EditorCommand";
import { Timeline } from "./Timeline";
import { ChartViewHost } from "./views/ChartViewHost";
import { CHART_VIEWS } from "./views/ChartViews";
import type { ChartView } from "./views/ChartViews";
import { getCameraTickForPlayhead } from "./views/viewNavigation";
import { TrackList } from "./Tracklist";
import Toolbar from "./views/Toolbar";
import { CloseButton } from "./shared/Button/Button";

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
  const { viewportSessions, activeViewportId, maxViewportCount, addViewport } =
    useEditor();
  return (
    <section className="viewport-manager" aria-label="Chart viewports">
      <div className="viewport-manager__toolbar">
        <strong>Viewports</strong>
        <span>
          {viewportSessions.length}/{maxViewportCount}
        </span>
        <button
          type="button"
          onClick={() => addViewport("piano-roll")}
          disabled={viewportSessions.length >= maxViewportCount}
        >
          + Piano Roll
        </button>
        <button
          type="button"
          onClick={() => addViewport("highway")}
          disabled={viewportSessions.length >= maxViewportCount}
        >
          + Highway
        </button>
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
    updateViewport,
    closeViewport,
    focusViewport,
    snapEnabled,
    snapDenominator,
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
  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;
  const activeView =
    CHART_VIEWS.find((view) => view.id === session.view) ?? CHART_VIEWS[0];
  const selectedTrackIndex = midiData
    ? trackIndexForSession(midiData, session)
    : null;

  const keepPlayheadVisible = useCallback(
    (view: ChartView) => {
      const cameraTick = getCameraTickForPlayhead(
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
      if (event.code === "Space" && active) {
        event.preventDefault();
        togglePlayRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  useEffect(() => {
    chartViewRef.current?.setPlayheadTick(playheadTick);
  }, [playheadTick]);

  useEffect(() => {
    const view = chartViewRef.current;
    if (!view) return;
    view.onNotesChanged = () => {
      markDirty();
      refreshTotalTicks();
    };
    view.onSeekRequest = setPlaybackTick;
    view.onCameraChange = () =>
      updateViewport(session.id, { camera: { tick: view.getCameraTick() } });
    return () => {
      view.onNotesChanged = null;
      view.onSeekRequest = null;
      view.onCameraChange = null;
    };
  }, [
    markDirty,
    refreshTotalTicks,
    session.id,
    setPlaybackTick,
    updateViewport,
  ]);

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
        <div className="viewport-panel__actions">
          <CloseButton
            onClick={() => closeViewport(session.id)}
            disabled={viewportSessions.length <= 1}
          />
        </div>
      </header>
      <Toolbar session={session} onViewChange={setView} />
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
      <Timeline chartView={chartView} />
    </article>
  );
}
