import type { Midi } from "@openchart/midi";
import {
  Difficulty,
  type CompiledRuleset,
  type ToolDescriptor,
} from "@openchart/views";
import { startCase } from "es-toolkit";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { runAction } from "../../../actions/execute";
import { useSettings } from "../../../hooks/useApplication";
import { useDocument } from "../../../hooks/useDocument";
import { useRuleset } from "../../../hooks/useRuleset";
import { usePlaybackSelector } from "../../../hooks/usePlayback";
import { useViewport } from "../../../hooks/useViewport";
import { ViewHotkeyScopes } from "../../../input/ViewportHotkeyScopes";
import Platform from "../../../platform";
import type { EngineOptions } from "../../../rendering/engine";
import { ActiveChartViewService } from "../../../services/editor/activeChartView";
import type { EditingService } from "../../../services/editor/editing";
import { type ViewportSession } from "../../../services/editor/viewports";
import { PlaybackService } from "../../../services/playback";
import { Button, CloseButton } from "../../shared";
import {
  BassIcon,
  DrumsIcon,
  FivepadIcon,
  FourpadIcon,
  GuitarIcon,
  NoteIcon,
  PianoIcon,
  SplitIcon,
  VocalsIcon,
} from "../../shared";
import { ChartViewHost } from "../../views/ChartViewHost";
import type { AnyChartView } from "../../views/ChartViews";
import { ChartViews } from "../../views/ChartViews";
import { HighwayView } from "../../views/highway";
import type { HighwayMode } from "../../views/highway";
import { PianoRollView, type PianoRollNote } from "../../views/pianoRoll";
import type { PianoRollVocalPlacement } from "../../views/pianoRoll";
import { Timeline } from "../Timeline/Timeline";
import Toolbar from "../Toolbar";
import { TrackList } from "../../dialogs";
import styles from "./Viewport.module.css";

/**
 * Icon for a track, chosen by its ruleset `kind`. Guitar tracks whose name
 * says RHYTHM use the bass icon; gamepad tracks pick by column count.
 */
function InstrumentIcon({
  instrument,
  rules,
}: {
  instrument: string;
  rules: CompiledRuleset;
}) {
  const track = rules.byName.get(instrument);
  switch (track?.kind) {
    case "guitar":
      return /RHYTHM|BASS/i.test(track.name) ? (
        <BassIcon width={18} height={18} />
      ) : (
        <GuitarIcon width={18} height={18} />
      );
    case "gamepad":
      return track.columns.length >= 5 ? (
        <FivepadIcon width={18} height={18} />
      ) : (
        <FourpadIcon width={18} height={18} />
      );
    case "drums":
      return <DrumsIcon width={18} height={18} />;
    case "vocals":
      return <VocalsIcon width={18} height={18} />;
    case undefined:
      return /SYNTH|KEYS|PIANO/i.test(instrument) ? (
        <PianoIcon width={18} height={18} />
      ) : (
        <NoteIcon width={18} height={18} />
      );
    default:
      return <NoteIcon width={18} height={18} />;
  }
}

function updateCameraData(
  article: HTMLElement | null,
  view: AnyChartView,
): void {
  if (!article) {
    return;
  }
  article.dataset.cameraTick = String(view.getCameraTick());
  article.dataset.visibleTickSpan = String(view.getVisibleTickSpan());
}

function chartViewMatchesSession(
  view: AnyChartView,
  viewKind: ViewportSession["view"],
): boolean {
  return viewKind === "highway"
    ? view instanceof HighwayView
    : view instanceof PianoRollView;
}

function trackIndexForSession(
  midi: Midi,
  session: ViewportSession,
  rules: CompiledRuleset,
): number | null {
  if (session.trackKey.startsWith("unmapped-")) {
    // Header tracks are part of the ruleset, so they are excluded here too.
    const names = new Set(rules.tracks.map((track) => track.name));
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
  const { viewportSessions, activeViewportId } = useViewport();
  const [chartViews, setChartViews] = useState<Map<string, AnyChartView>>(
    () => new Map(),
  );

  const handleChartViewChange = useCallback(
    (sessionId: string, chartView: AnyChartView | null) => {
      setChartViews((current) => {
        if (chartView && current.get(sessionId) === chartView) {
          return current;
        }
        if (!chartView && !current.has(sessionId)) {
          return current;
        }
        const next = new Map(current);
        if (chartView) {
          next.set(sessionId, chartView);
        } else {
          next.delete(sessionId);
        }
        return next;
      });
    },
    [],
  );

  const chartViewList = useMemo(() => [...chartViews.values()], [chartViews]);
  return (
    <section className={styles.viewportManager} aria-label="Chart viewports">
      <ViewHotkeyScopes />
      <div className={styles.viewportGrid} data-count={viewportSessions.length}>
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
  onChartViewChange: (
    sessionId: string,
    chartView: AnyChartView | null,
  ) => void;
}) {
  const { midi: midiData } = useDocument();
  const { compiled: rules } = useRuleset();
  const { settings } = useSettings();
  const {
    viewportSessions,
    maxViewportCount,
    snapEnabled,
    snapDenominator,
    lockCursor,
  } = useViewport();
  const isPlaying = usePlaybackSelector((s) => s.isPlaying);
  const setActiveView = usePlaybackSelector((s) => s.setActiveView);
  const stopPreview = usePlaybackSelector((s) => s.stopPreview);
  const articleRef = useRef<HTMLElement | null>(null);
  const activeChartView = Platform.services.get<ActiveChartViewService>(
    "editor.active-chart-view",
  );
  const editingService =
    Platform.services.get<EditingService>("editor.editing");
  const editingSession = editingService.getSession(session.id);
  const globalEditingSession =
    session.view === "piano-roll"
      ? editingService.getSession(session.id, "global")
      : null;
  const [chartView, setChartView] = useState<AnyChartView | null>(null);
  const modeState = getStateValues(editingSession?.getToolState());
  // Tools depend on the track's rules (phrases, placements), so ask the session.
  const tools = editingSession?.getTools() ?? [];
  const highwayMode = getHighwayMode(tools, modeState);
  const notePlacementType = getModeValue(tools, modeState, "placement");
  const vocalPlacement = getVocalPlacement(
    editingSession?.mode.id ?? null,
    modeState,
  );
  const activeView =
    ChartViews.find((view) => view.id === session.view) ?? ChartViews[0];
  const engineOptions = useMemo<EngineOptions>(() => {
    return {
      background: 0x151515,
      antialias: settings.graphics.antialiasing,
      pixelRatioCap: 2,
    };
  }, [settings.graphics.antialiasing]);
  const selectedTrackIndex = midiData
    ? trackIndexForSession(midiData, session, rules)
    : null;

  const handleReady = (view: AnyChartView | null): void => {
    if (view && !chartViewMatchesSession(view, session.view)) {
      return;
    }
    view?.setEditingSession(editingSession);
    if (view instanceof PianoRollView) {
      view.setGlobalEditingSession(globalEditingSession);
    }
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

  function getStateValues(state: unknown): Record<string, unknown> {
    if (typeof state !== "object" || state === null || Array.isArray(state)) {
      return {};
    }
    return state as Record<string, unknown>;
  }

  function getModeValue(
    tools: readonly ToolDescriptor[],
    state: Record<string, unknown>,
    stateKey: string,
  ): unknown {
    return tools.some(
      (tool) => tool.group === "placement" && tool.stateKey === stateKey,
    )
      ? state[stateKey]
      : undefined;
  }

  /** The active phrase tool's phrase id, else the active plain tool. */
  function getHighwayMode(
    tools: readonly ToolDescriptor[],
    state: Record<string, unknown>,
  ): HighwayMode | null {
    const active = (stateKey: string) =>
      tools.find(
        (tool) =>
          tool.group === "highway-tools" &&
          tool.stateKey === stateKey &&
          Object.is(state[tool.stateKey], tool.value),
      );
    const value = (active("phrase") ?? active("tool"))?.value;
    return typeof value === "string" ? value : null;
  }

  function getVocalPlacement(
    modeId: string | null,
    state: Record<string, unknown>,
  ): PianoRollVocalPlacement | null {
    if (modeId !== "vocals") return null;
    const noteKind = state.noteKind;
    const phrase = state.phrase;
    if (
      (noteKind !== "pitched" &&
        noteKind !== "pitchless" &&
        noteKind !== "percussion") ||
      (phrase !== null &&
        phrase !== "vocal" &&
        phrase !== "power-window" &&
        phrase !== "stagepower")
    ) {
      return null;
    }
    return { noteKind, phrase };
  }

  /* Effect executed when the chart view or session ID change */
  useEffect(() => {
    const view = chartView;
    if (!view) {
      return;
    }
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
    if (chartView instanceof HighwayView && highwayMode) {
      chartView.setMode(highwayMode);
    }
  }, [chartView, highwayMode]);

  useEffect(() => {
    if (chartView instanceof HighwayView) {
      if (typeof notePlacementType === "string") {
        chartView.setNotePlacementType(notePlacementType);
      }
    }
  }, [chartView, notePlacementType]);

  useLayoutEffect(() => {
    if (!chartView || !chartViewMatchesSession(chartView, session.view)) return;
    chartView.setEditingSession(editingSession);
    if (chartView instanceof PianoRollView) {
      chartView.setGlobalEditingSession(globalEditingSession);
      chartView.applyCameraState(getPianoRollCamera());
    }
  }, [chartView, editingSession, globalEditingSession, session.view]);

  useEffect(() => {
    if (chartView instanceof PianoRollView && vocalPlacement) {
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

  return (
    <article
      ref={articleRef}
      data-testid="viewport-panel"
      data-viewport-id={session.id}
      data-view={session.view}
      className={`${styles.viewportPanel}${active ? ` ${styles.viewportPanelActive}` : ""}`}
      onPointerDown={() => runAction("editor.focus-viewport", session.id)}
    >
      <header className={styles.viewportPanelHeader}>
        <p className={styles.viewportPanelTitle}>
          <span className={styles.viewportPanelTitleIcon} aria-hidden="true">
            <InstrumentIcon instrument={session.instrument} rules={rules} />
          </span>
          <span className={styles.viewportPanelTitleText}>
            {session.view === "piano-roll"
              ? session.instrument
              : `${startCase(session.instrument)} (${Difficulty[session.difficulty]})`}
          </span>
        </p>
        <div className={styles.viewportPanelActions}>
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
      <Toolbar session={session} />
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          flex: "1 1 0",
          minHeight: 0,
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            flex: "0 0 30%",
            minWidth: 110,
            maxWidth: 200,
            minHeight: 0,
          }}
        >
          <TrackList session={session} />
        </div>
        <div
          style={{
            position: "relative",
            flex: "1 1 0",
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <ChartViewHost
            createRenderer={activeView.createRenderer}
            engineOptions={engineOptions}
            state={{
              midi: midiData,
              selectedTrackKey: session.trackKey,
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
