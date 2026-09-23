import { useCallback, useState, useEffect, useRef } from "react";
import { Difficulty, InstrumentType } from "@midiedit/views";
import { useEditor } from "../context/EditorContext";
import { usePlayback } from "../context/PlaybackContextStore";
import { useEditorCommands } from "../commands/EditorCommand";
import { Timeline } from "./Timeline";
import { ChartViewHost } from "./views/ChartViewHost";
import { CHART_VIEWS } from "./views/ChartViews";
import type { ChartView } from "./views/ChartViews";
import { getCameraTickForPlayhead } from "./views/viewNavigation";
import Toolbar from "./views/Toolbar";

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}

interface ViewportProps {
  onChartViewReady: (view: ChartView | null) => void;
}

export const Viewport = ({ onChartViewReady }: ViewportProps) => {
  const {
    midiData,
    selectedTrackIndex,
    selectedInstrument,
    selectedDifficulty,
    setSelectedDifficulty,
    setSelectedInstrument,
    activeViewId,
    snapEnabled,
    snapDenominator,
  } = useEditor();
  const {
    isPlaying,
    playbackTick: playheadTick,
    togglePlay,
    setPlaybackTick: setPlayheadTick,
    refresh: refreshTotalTicks,
    stopPreview,
    setActiveView,
  } = usePlayback();
  const { markDirty } = useEditorCommands();
  const [chartView, setChartView] = useState<ChartView | null>(null);
  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;

  const keepPlayheadVisible = useCallback(
    (view: ChartView): void => {
      const cameraTick = getCameraTickForPlayhead(
        playheadTick,
        view.getCameraTick(),
        view.getVisibleTickSpan(),
      );
      if (cameraTick !== null) {
        view.setCameraTick(cameraTick);
      }
    },
    [playheadTick],
  );

  const handleChartViewReady = useCallback(
    (view: ChartView | null) => {
      if (view) {
        view.setPlayheadTick(playheadTick);
        keepPlayheadVisible(view);
      }
      setChartView(view);
      onChartViewReady(view);
    },
    [keepPlayheadVisible, onChartViewReady, playheadTick],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.code === "Space" && !isTypingTarget(event.target)) {
        event.preventDefault();
        togglePlayRef.current();
        return;
      }

      if (event.key.toLowerCase() !== "s" || isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Keep the chart view's rendered cursor in sync with the playhead.
  useEffect(() => {
    chartView?.setPlayheadTick(playheadTick);
  }, [chartView, playheadTick]);

  // Preview voices belong to the piano-roll interaction mode, not to a chart
  // renderer. Stop them whenever the active mode changes.
  useEffect(() => {
    setActiveView(activeViewId);
    stopPreview();
  }, [activeViewId, setActiveView, stopPreview]);

  // Recompute the playback range whenever notes are added or removed.
  useEffect(() => {
    if (!chartView) {
      return;
    }

    chartView.onNotesChanged = () => {
      markDirty();
      refreshTotalTicks();
    };

    return () => {
      chartView.onNotesChanged = null;
    };
  }, [chartView, markDirty, refreshTotalTicks]);

  // A plain click (no drag) in the chart view seeks the playhead there.
  useEffect(() => {
    if (!chartView) {
      return;
    }

    chartView.onSeekRequest = setPlayheadTick;

    return () => {
      chartView.onSeekRequest = null;
    };
  }, [chartView, setPlayheadTick]);

  // While playing, keep the playhead in view by following it with the camera.
  useEffect(() => {
    if (isPlaying && chartView) {
      keepPlayheadVisible(chartView);
    }
  }, [isPlaying, chartView, keepPlayheadVisible]);

  const activeView =
    CHART_VIEWS.find((view) => view.id === activeViewId) ?? CHART_VIEWS[0];

  const selectedTrack =
    midiData && selectedTrackIndex !== null
      ? midiData.tracks[selectedTrackIndex]
      : null;
  const isHighwayView = activeView.id === "highway";

  return (
    <section className="midi-view">
      <div className="midi-view__header">
        <div className="midi-view__title">
          <strong>{activeView.name}</strong>

          <span>
            {selectedTrack
              ? selectedTrack.name || `Track ${selectedTrackIndex! + 1}`
              : "No track selected"}
          </span>
        </div>

        <div className="midi-view__controls">
          {isHighwayView && (
            <>
              <select
                aria-label="Instrument"
                value={selectedInstrument}
                onChange={(event) => {
                  setSelectedInstrument(event.target.value);
                }}
              >
                {Object.values(InstrumentType).map((instrument) => (
                  <option key={instrument} value={instrument}>
                    {instrument}
                  </option>
                ))}
              </select>

              <select
                aria-label="Difficulty"
                value={selectedDifficulty}
                onChange={(event) => {
                  setSelectedDifficulty(
                    Number(event.target.value) as Difficulty,
                  );
                }}
              >
                <option value={Difficulty.Easy}>Easy</option>
                <option value={Difficulty.Medium}>Medium</option>
                <option value={Difficulty.Hard}>Hard</option>
                <option value={Difficulty.Expert}>Expert</option>
              </select>
            </>
          )}
        </div>
      </div>

      <Toolbar />
      <div className="midi-view__body">
        <ChartViewHost
          createRenderer={activeView.createRenderer}
          state={{
            midi: midiData,
            selectedTrackIndex,
            selectedInstrument,
            selectedDifficulty,
            snap: { enabled: snapEnabled, denominator: snapDenominator },
            isPlaying,
          }}
          onReady={handleChartViewReady}
        />
      </div>

      <Timeline chartView={chartView} />
    </section>
  );
};
