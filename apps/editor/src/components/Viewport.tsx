import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Midi } from "@openchart/core";
import { Difficulty, InstrumentType, SongView } from "@openchart/views";
import { type ViewportSession } from "../services/editor/viewports";
import { useDocumentSnapshot } from "../hooks/useDocumentSnapshot";
import { useViewportSnapshot } from "../hooks/useViewportSnapshot";
import { usePlaybackSelector } from "../hooks/usePlayback";
import { useApplicationSettings } from "../hooks/useApplicationSettings";
import { runAction } from "../actions/execute";
import Platform from "../platform";
import { PlaybackService } from "../services/playback";
import { ActiveChartViewService } from "../services/editor/activeChartView";
import { Timeline } from "./Timeline";
import { ChartViewHost } from "./views/ChartViewHost";
import type { EngineOptions } from "../rendering/engine";
import { CHART_VIEWS } from "./views/ChartViews";
import type { ChartView } from "./views/ChartViews";
import {
  HighwayView,
  type DrumPlacementKind,
  type HighwayMode,
  type HighwayNotePlacementType,
} from "./views/highway";
import { TrackList } from "./Tracklist";
import Toolbar from "./views/Toolbar";
import { Button, CloseButton, ToolButton } from "./shared/Button";
import { Popup } from "./shared/Popup";
import { Slider } from "./shared/Slider";
import { Text } from "./shared/Text";
import { isTypingTarget } from "../util/html";
import { startCase } from "es-toolkit";
import { HIGHWAY_SCROLL_SPEED_RANGE } from "../services/settings";
import {
  BassIcon,
  DrumsIcon,
  GuitarIcon,
  FourpadIcon,
  FivepadIcon,
  NoteIcon,
  PianoIcon,
  SplitIcon,
  VocalsIcon,
  SettingsIcon,
} from "./shared/Icon/Icon";

function InstrumentIcon({ instrument }: { instrument: string }) {
  switch (instrument) {
    case InstrumentType.Lead:
      return <GuitarIcon width={18} height={18} />;
    case InstrumentType.FourPad:
      return <FourpadIcon width={18} height={18} />;
    case InstrumentType.FivePad:
      return <FivepadIcon width={18} height={18} />;
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

function updateCameraData(article: HTMLElement | null, view: ChartView): void {
  if (!article) return;
  article.dataset.cameraTick = String(view.getCameraTick());
  article.dataset.visibleTickSpan = String(view.getVisibleTickSpan());
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

export const Viewport = () => {
  const { viewportSessions, activeViewportId } = useViewportSnapshot();
  const [chartViews, setChartViews] = useState<Map<string, ChartView>>(
    () => new Map(),
  );
  const handleChartViewChange = useCallback(
    (sessionId: string, chartView: ChartView | null) => {
      setChartViews((current) => {
        if (chartView && current.get(sessionId) === chartView) return current;
        if (!chartView && !current.has(sessionId)) return current;
        const next = new Map(current);
        if (chartView) next.set(sessionId, chartView);
        else next.delete(sessionId);
        return next;
      });
    },
    [],
  );
  const chartViewList = useMemo(() => [...chartViews.values()], [chartViews]);
  return (
    <section className="viewport-manager" aria-label="Chart viewports">
      <div
        className={`viewport-grid viewport-grid--${viewportSessions.length}`}
      >
        {viewportSessions.map((session) => (
          <ViewportPanel
            key={session.id}
            session={session}
            active={session.id === activeViewportId}
            onChartViewChange={handleChartViewChange}
          />
        ))}
      </div>
      <Timeline chartViews={chartViewList} />
    </section>
  );
};

function ViewportPanel({
  session,
  active,
  onChartViewChange,
}: {
  session: ViewportSession;
  active: boolean;
  onChartViewChange: (sessionId: string, chartView: ChartView | null) => void;
}) {
  const { midiData } = useDocumentSnapshot();
  const { settings, applySetting } = useApplicationSettings();
  const { viewportSessions, maxViewportCount, snapEnabled, snapDenominator } =
    useViewportSnapshot();
  const isPlaying = usePlaybackSelector((s) => s.isPlaying);
  const setActiveView = usePlaybackSelector((s) => s.setActiveView);
  const stopPreview = usePlaybackSelector((s) => s.stopPreview);
  const articleRef = useRef<HTMLElement | null>(null);
  const activeChartView = Platform.services.get<ActiveChartViewService>(
    "editor.active-chart-view",
  );
  const [chartView, setChartView] = useState<ChartView | null>(null);
  const [highwayMode, setHighwayMode] = useState<HighwayMode>("select");
  const [drumPlacementKind, setDrumPlacementKind] =
    useState<DrumPlacementKind>("pad");
  const [notePlacementType, setNotePlacementType] =
    useState<HighwayNotePlacementType>("normal");
  const activeView =
    CHART_VIEWS.find((view) => view.id === session.view) ?? CHART_VIEWS[0];
  const engineOptions = useMemo<EngineOptions>(() => {
    return {
      background: 0x151515,
      antialias: settings.graphics.antialiasing,
      pixelRatioCap: 2,
    };
  }, [settings.graphics.antialiasing]);
  const selectedTrackIndex = midiData
    ? trackIndexForSession(midiData, session)
    : null;

  const handleReady = (view: ChartView | null): void => {
    setChartView(view);
  };

  const getCameraTick = useEffectEvent(() => session.camera.tick);

  useEffect(() => {
    onChartViewChange(session.id, chartView);
    return () => onChartViewChange(session.id, null);
  }, [chartView, onChartViewChange, session.id]);

  useEffect(() => {
    if (!chartView) return;
    const cameraTick = getCameraTick();
    if (cameraTick) chartView.setCameraTick(cameraTick);
    updateCameraData(articleRef.current, chartView);
  }, [chartView]);

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
        runAction("playback.toggle");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, session.view]);

  useEffect(() => {
    const view = chartView;
    if (!view) return;
    view.onNotesChanged = () => {
      runAction("history.record-edit");
      runAction("playback.refresh");
    };
    view.onEditStart = () => {
      runAction("history.begin-edit");
    };
    view.onEditEnd = () => {
      runAction("history.end-edit");
    };
    view.onSeekRequest = (tick) => runAction("playback.set-tick", tick);
    view.onSnapDenominatorChange = (denominator) =>
      runAction("editor.set-snap-denominator", denominator);
    const unsubscribeCameraChange = view.subscribeCameraChange(() => {
      updateCameraData(articleRef.current, view);
      runAction("editor.update-viewport", session.id, {
        camera: { tick: view.getCameraTick() },
      });
    });
    return () => {
      unsubscribeCameraChange();
      view.onNotesChanged = null;
      view.onEditStart = null;
      view.onEditEnd = null;
      view.onSeekRequest = null;
      view.onSnapDenominatorChange = null;
    };
  }, [chartView, session.id]);

  useEffect(() => {
    if (!chartView) return;
    const playback = Platform.services.get<PlaybackService>("playback");
    const sync = (): void => {
      const { playbackTick } = playback.getSnapshot();
      chartView.setPlayheadTick(playbackTick);
      const cameraTick = chartView.getCameraTickForPlayhead(playbackTick);
      if (cameraTick !== null) chartView.setCameraTick(cameraTick);
    };
    sync();
    return playback.subscribe(sync);
  }, [chartView, isPlaying]); // Re-sync when playback starts or stops.

  useEffect(() => {
    if (!active) return;
    activeChartView.set(chartView);
    return () => activeChartView.set(null);
  }, [active, activeChartView, chartView]);

  useEffect(() => {
    if (chartView instanceof HighwayView) {
      chartView.setMode(highwayMode);
      chartView.setDrumPlacementKind(drumPlacementKind);
      chartView.setNotePlacementType(notePlacementType);
    }
  }, [chartView, highwayMode, drumPlacementKind, notePlacementType]);

  useEffect(() => {
    if (chartView instanceof HighwayView) {
      chartView.setScrollSpeedMultiplier(settings.graphics.scrollSpeed);
    }
  }, [chartView, settings.graphics.scrollSpeed]);

  useEffect(() => {
    if (!active) return;
    setActiveView(session.view);
    stopPreview();
  }, [active, session.view, setActiveView, stopPreview]);

  const setView = (view: ViewportSession["view"]) => {
    runAction("editor.focus-viewport", session.id);
    const { playbackTick } = Platform.services
      .get<PlaybackService>("playback")
      .getSnapshot();
    runAction("editor.update-viewport", session.id, {
      view,
      camera: { tick: playbackTick },
    });
  };

  const showTrackList = session.view === "piano-roll";

  return (
    <article
      ref={articleRef}
      data-testid="viewport-panel"
      data-viewport-id={session.id}
      data-view={session.view}
      className={`viewport-panel${active ? " viewport-panel--active" : ""}`}
      onPointerDown={() => runAction("editor.focus-viewport", session.id)}
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
            ariaLabel={`Split ${session.view === "piano-roll" ? "Piano Roll" : "Highway"} to the right`}
            onClick={() =>
              runAction("editor.add-viewport", session.view, session.id)
            }
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
            onClick={() => runAction("editor.close-viewport", session.id)}
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
        notePlacementType={notePlacementType}
        onNotePlacementTypeChange={setNotePlacementType}
      />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {showTrackList && <TrackList viewportId={session.id} />}
        <div
          style={{ position: "relative", flex: 1, minWidth: 0, minHeight: 0 }}
        >
          {session.view === "highway" && (
            <div className="viewport-panel__highway-settings">
              <Popup
                trigger={
                  <ToolButton
                    Icon={SettingsIcon}
                    border="none"
                    borderRadius={32}
                  />
                }
                title="Viewport Settings"
                width={280}
              >
                <div
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}
                >
                  <Text>Scroll Speed</Text>
                  <Slider
                    aria-label="Scroll speed"
                    value={String(settings.graphics.scrollSpeed)}
                    onInput={(event) =>
                      applySetting(
                        "graphics.scrollSpeed",
                        Number(event.currentTarget.value),
                      )
                    }
                    step={HIGHWAY_SCROLL_SPEED_RANGE.step}
                    min={HIGHWAY_SCROLL_SPEED_RANGE.min}
                    max={HIGHWAY_SCROLL_SPEED_RANGE.max}
                    width="100%"
                  />
                </div>
              </Popup>
            </div>
          )}
          <ChartViewHost
            createRenderer={activeView.createRenderer}
            engineOptions={engineOptions}
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
    </article>
  );
}
