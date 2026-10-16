import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Midi } from "@openchart/core";
import {
  Difficulty,
  InstrumentType,
  SongView,
  type VocalPhraseKind,
} from "@openchart/views";
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
import {
  PianoRollView,
  profileForInstrument,
  type PianoRollNote,
  type VocalPlacement,
} from "./views/pianoRoll";
import { TrackList } from "./Tracklist";
import Toolbar from "./Toolbar";
import { Button, CloseButton } from "./shared/Button";
import { isTypingTarget } from "../util/html";
import { startCase } from "es-toolkit";
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
} from "./shared/Icon/Icon";
import { ViewportSettings } from "./ViewportSettings";
import { MixerSettings } from "./MixerSettings";

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
  if (!article) {
    return;
  }
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
  const { midi: midiData } = useDocumentSnapshot();
  const { settings } = useApplicationSettings();
  const {
    viewportSessions,
    maxViewportCount,
    snapEnabled,
    snapDenominator,
    lockCursor,
  } = useViewportSnapshot();
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
  const [vocalPlacement, setVocalPlacement] = useState<VocalPlacement>({
    noteKind: "pitched",
    phrase: null,
  });
  const pianoRollProfile = profileForInstrument(session.instrument);
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
  const getPianoRollCamera = useEffectEvent(() => session.camera.pianoRoll);

  useEffect(() => {
    onChartViewChange(session.id, chartView);
    return () => onChartViewChange(session.id, null);
  }, [chartView, onChartViewChange, session.id]);

  useEffect(() => {
    if (!chartView) return;
    const cameraTick = getCameraTick();
    if (cameraTick !== chartView.getCameraTick()) {
      chartView.setCameraTick(cameraTick);
    }
    updateCameraData(articleRef.current, chartView);
  }, [chartView, session.camera.tick]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const isInvalidKey =
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTypingTarget(event.target);
      if (isInvalidKey) {
        return;
      }

      const isValidPianoView =
        active &&
        session.view === "piano-roll" &&
        pianoRollProfile.editing === "vocal";

      if (isValidPianoView) {
        const key = event.key.toLowerCase();
        const phraseKeys: Record<string, VocalPhraseKind> = {
          r: "stagepower",
          t: "vocal",
          y: "power-window",
        };
        let phrase: VocalPhraseKind | null = phraseKeys[key] ?? null;
        if (phrase) {
          event.preventDefault();
          setVocalPlacement((current) => ({
            ...current,
            phrase: current.phrase === phrase ? null : phrase,
          }));
          return;
        }
      }
      const isValidHighwayView = active && session.view === "highway";
      if (isValidHighwayView) {
        const key = event.key.toLowerCase();
        const keyMap: Record<string, HighwayMode> = {
          q: "select",
          w: "place",
          e: "remove",
          r: "stagepower",
          t: "solo",
        };
        const mode = keyMap[key] ?? null;
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
  }, [active, session.view, pianoRollProfile.editing]);

  const onNotesChanged = () => {
    runAction("history.record-edit");
    runAction("playback.refresh");
  };
  const onBeginEdit = () => runAction("history.begin-edit");
  const onEndEdit = () => runAction("history.end-edit");
  const onRollbackEdit = () => {
    try {
      return (
        Platform.actions.executeAction<boolean>("history.rollback-edit") ===
        true
      );
    } catch {
      return false;
    }
  };

  function onNotePreview(this: PianoRollView, notes: readonly PianoRollNote[]) {
    const playback = Platform.services.get<PlaybackService>("playback");
    if (!playback.getSnapshot().isVocalPitchFeedbackEnabled) return;
    playback.previewNotes(
      notes.map((note) => ({
        pitch: note.pitch,
        startTick: note.tick,
        endTick: note.tick + note.durationTicks,
        velocity: note.velocity,
      })),
      // The settings preview range (36-60 by default) is narrower than
      // the vocal range, so pass the profile's range explicitly.
      this.getProfile().pitchRange,
    );
  }

  /* Effect executed when the chart view or session ID change */
  useEffect(() => {
    const view = chartView;
    if (!view) {
      return;
    }
    view.onNotesChanged = onNotesChanged;
    view.onBeginEdit = onBeginEdit;
    view.onEndEdit = onEndEdit;
    view.onRollbackEdit = onRollbackEdit;
    if (view instanceof PianoRollView) {
      view.onNotePreview = onNotePreview;
    }
    view.onSeekRequest = (tick) => runAction("playback.set-tick", tick);
    view.onSnapDenominatorChange = (denominator) =>
      runAction("editor.set-snap-denominator", denominator);
    const unsubscribeCameraChange = view.subscribeCameraChange(() => {
      updateCameraData(articleRef.current, view);
      runAction("editor.update-viewport", session.id, {
        camera:
          view instanceof PianoRollView
            ? { tick: view.getCameraTick(), pianoRoll: view.getCameraState() }
            : { tick: view.getCameraTick() },
      });
    });
    return () => {
      unsubscribeCameraChange();
      view.onNotesChanged = null;
      view.onBeginEdit = null;
      view.onEndEdit = null;
      view.onRollbackEdit = null;
      if (view instanceof PianoRollView) {
        view.onNotePreview = null;
      }
      view.onSeekRequest = null;
      view.onSnapDenominatorChange = null;
    };
  }, [chartView, session.id]);

  useEffect(() => {
    if (!chartView) {
      return;
    }
    const playback = Platform.services.get<PlaybackService>("playback");
    const sync = (): void => {
      const { playbackTick } = playback.getSnapshot();
      chartView.setPlayheadTick(playbackTick);
      if (!active) {
        return;
      }
      const cameraTick = chartView.getCameraTickForPlayhead(playbackTick);
      if (cameraTick !== null && cameraTick !== getCameraTick()) {
        runAction("editor.update-viewport", session.id, {
          camera: { tick: cameraTick },
        });
      }
    };
    sync();
    return playback.subscribe(sync);
  }, [active, chartView, isPlaying, session.id]); // Re-sync when playback starts or stops.

  useEffect(() => {
    if (!active) {
      return;
    }
    activeChartView.set(chartView);
    return () => activeChartView.set(null);
  }, [active, activeChartView, chartView]);

  useLayoutEffect(() => {
    if (chartView instanceof HighwayView) {
      chartView.setMode(highwayMode);
    }
  }, [chartView, highwayMode]);

  useEffect(() => {
    if (chartView instanceof HighwayView) {
      chartView.setDrumPlacementKind(drumPlacementKind);
      chartView.setNotePlacementType(notePlacementType);
    }
  }, [chartView, drumPlacementKind, notePlacementType]);

  useEffect(() => {
    if (!(chartView instanceof PianoRollView)) {
      return;
    }
    // Same pattern as HighwayView.setMode(): swap behaviour on the live
    // renderer instead of recreating it, so the camera survives.
    chartView.setProfile(pianoRollProfile);
    chartView.applyCameraState(getPianoRollCamera());
  }, [chartView, pianoRollProfile]);

  useEffect(() => {
    if (chartView instanceof PianoRollView) {
      chartView.setVocalPlacement(vocalPlacement);
    }
  }, [chartView, vocalPlacement]);

  useEffect(() => {
    if (chartView instanceof HighwayView) {
      chartView.setScrollSpeedMultiplier(settings.graphics.scrollSpeed);
    }
  }, [chartView, settings.graphics.scrollSpeed]);

  useEffect(() => {
    if (!active) {
      return;
    }
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
            aria-label={`Split ${session.view === "piano-roll" ? "Piano Roll" : "Highway"} to the right`}
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
        vocalPlacement={vocalPlacement}
        onVocalPlacementChange={setVocalPlacement}
      />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {showTrackList && <TrackList viewportId={session.id} />}
        <div
          style={{ position: "relative", flex: 1, minWidth: 0, minHeight: 0 }}
        >
          {session.view === "highway" && (
            <div>
              <ViewportSettings />
              <MixerSettings />
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
              lockCursor,
              isPlaying,
            }}
            onReady={handleReady}
          />
        </div>
      </div>
    </article>
  );
}
