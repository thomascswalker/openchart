import { useEffect, useState, useSyncExternalStore } from "react";
import { useDocumentSnapshot } from "../../hooks/useDocumentSnapshot";
import { useViewportSnapshot } from "../../hooks/useViewportSnapshot";
import { usePlayback } from "../../hooks/usePlayback";
import Platform from "../../platform";
import { ActiveChartViewService } from "../../services/editor/activeChartView";
import {
  isCameraDebugView,
  type CameraDebugState,
} from "../views/AbstractChartView";
import type { ChartView } from "../views/ChartViews";

interface DebugWindowProps {
  onClose: () => void;
}

interface DebugEvent {
  type: string;
  detail: string;
  time: string;
}

const TEMPO_META_EVENT_TYPE = 0x51;

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : "n/a";
}

function formatMinutes(milliseconds: number): string {
  return Number.isFinite(milliseconds) && milliseconds > 0
    ? `${(milliseconds / 60_000).toFixed(2)} min`
    : "n/a";
}

function trackMaxTick(track: {
  getTimedEvents: () => { tick: number }[];
}): number {
  const timedEvents = track.getTimedEvents();
  return timedEvents[timedEvents.length - 1]?.tick ?? 0;
}

type CameraDraft = {
  positionX: string;
  positionY: string;
  positionZ: string;
  rotationX: string;
  rotationY: string;
  rotationZ: string;
  fieldOfView: string;
};

const CAMERA_FIELDS: {
  key: keyof CameraDraft;
  label: string;
  step: string;
}[] = [
  { key: "positionX", label: "Position X", step: "0.1" },
  { key: "positionY", label: "Position Y", step: "0.1" },
  { key: "positionZ", label: "Position Z", step: "0.1" },
  { key: "rotationX", label: "Rotation X (deg)", step: "1" },
  { key: "rotationY", label: "Rotation Y (deg)", step: "1" },
  { key: "rotationZ", label: "Rotation Z (deg)", step: "1" },
  { key: "fieldOfView", label: "FOV (deg)", step: "1" },
];

function cameraStateToDraft(state: CameraDebugState): CameraDraft {
  return {
    positionX: String(state.position.x),
    positionY: String(state.position.y),
    positionZ: String(state.position.z),
    rotationX: String(state.rotation.x),
    rotationY: String(state.rotation.y),
    rotationZ: String(state.rotation.z),
    fieldOfView: String(state.fieldOfView),
  };
}

function cameraDraftToState(draft: CameraDraft): CameraDebugState | null {
  const values = Object.fromEntries(
    Object.entries(draft).map(([key, value]) => [key, Number(value)]),
  ) as Record<keyof CameraDraft, number>;

  if (Object.values(values).some((value) => !Number.isFinite(value))) {
    return null;
  }

  return {
    position: {
      x: values.positionX,
      y: values.positionY,
      z: values.positionZ,
    },
    rotation: {
      x: values.rotationX,
      y: values.rotationY,
      z: values.rotationZ,
    },
    fieldOfView: values.fieldOfView,
  };
}

function CameraDebugSection({ chartView }: { chartView: ChartView | null }) {
  const cameraView = isCameraDebugView(chartView) ? chartView : null;
  const [draft, setDraft] = useState<CameraDraft | null>(() => {
    const state = cameraView?.getCameraDebugState() ?? null;
    return state ? cameraStateToDraft(state) : null;
  });
  const [error, setError] = useState<string | null>(null);

  if (!cameraView || !draft) {
    return null;
  }

  const updateDraft = (field: keyof CameraDraft, value: string): void => {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
    setError(null);
  };

  const handleApply = (): void => {
    const state = cameraDraftToState(draft);
    if (!state || !cameraView.applyCameraDebugState(state)) {
      setError("Enter finite values and an FOV from 1 to 179.");
      return;
    }

    setDraft(cameraStateToDraft(cameraView.getCameraDebugState() ?? state));
    setError(null);
  };

  const handleReset = (): void => {
    if (!cameraView.resetCameraDebugState()) {
      setError("Camera is not mounted.");
      return;
    }

    const state = cameraView.getCameraDebugState();
    setDraft(state ? cameraStateToDraft(state) : null);
    setError(null);
  };

  return (
    <section className="debug-panel__section">
      <h2>Highway camera</h2>
      <form
        className="debug-camera"
        onSubmit={(event) => {
          event.preventDefault();
          handleApply();
        }}
      >
        <div className="debug-camera__grid">
          {CAMERA_FIELDS.map(({ key, label, step }) => (
            <label key={key} className="debug-camera__field">
              <span>{label}</span>
              <input
                type="number"
                step={step}
                value={draft[key]}
                onChange={(event) => updateDraft(key, event.target.value)}
              />
            </label>
          ))}
        </div>
        <div className="debug-camera__actions">
          <button type="submit">Apply</button>
          <button type="button" onClick={handleReset}>
            Reset
          </button>
        </div>
        {error ? <p className="debug-camera__error">{error}</p> : null}
      </form>
    </section>
  );
}

function DebugPanel({
  onClose,
  events,
  pressedKeys,
  chartView,
}: {
  onClose: () => void;
  events: DebugEvent[];
  pressedKeys: string[];
  chartView: ChartView | null;
}) {
  const { midiData, fileName } = useDocumentSnapshot();
  const { viewportSessions, activeViewportId } = useViewportSnapshot();
  const activeViewport = viewportSessions.find(
    (session) => session.id === activeViewportId,
  );
  const selectedTrackIndex =
    activeViewport && midiData
      ? midiData.tracks.findIndex(
          (track) => track.name === activeViewport.instrument,
        )
      : null;
  const {
    audio,
    audioDurationMs,
    totalAudioTicks: audioTotalTicks,
    audioFileName,
    isPlaying,
    canPlay,
    playbackTick: playheadTick,
    totalTimelineTicks: totalTicks,
  } = usePlayback();

  const tracks = midiData?.tracks ?? [];
  const selectedTrack =
    selectedTrackIndex !== null ? tracks[selectedTrackIndex] : undefined;
  const currentAudioTimeMs = audio ? audio.currentTime * 1_000 : 0;

  return (
    <aside className="debug-panel">
      <div className="debug-panel__header">
        <h1>MidiView Debug</h1>
        <button type="button" onClick={onClose} aria-label="Close debug panel">
          Close
        </button>
      </div>

      <section className="debug-panel__section">
        <h2>MIDI track info</h2>
        <dl>
          <dt>Filename</dt>
          <dd>{fileName ?? "none"}</dd>
          <dt>Format</dt>
          <dd>{midiData ? midiData.header.format : "n/a"}</dd>
          <dt>Track count</dt>
          <dd>{formatNumber(tracks.length)}</dd>
          <dt>PPQN / division</dt>
          <dd>{midiData ? formatNumber(midiData.header.division) : "n/a"}</dd>
          <dt>Selected track</dt>
          <dd>
            {selectedTrackIndex === null ? "none" : selectedTrackIndex + 1}
          </dd>
        </dl>
      </section>

      <section className="debug-panel__section">
        <h2>Current track info</h2>
        <dl>
          <dt>Name</dt>
          <dd>{selectedTrack?.name || "none"}</dd>
          <dt>Note count</dt>
          <dd>
            {selectedTrack
              ? formatNumber(selectedTrack.getNotes().length)
              : "n/a"}
          </dd>
          <dt>Event count</dt>
          <dd>
            {selectedTrack ? formatNumber(selectedTrack.events.length) : "n/a"}
          </dd>
          <dt>Maximum tick</dt>
          <dd>
            {selectedTrack ? formatNumber(trackMaxTick(selectedTrack)) : "n/a"}
          </dd>
          <dt>Meta events</dt>
          <dd>
            {selectedTrack
              ? formatNumber(selectedTrack.getMetaEvents().length)
              : "n/a"}
          </dd>
          <dt>Tempo events</dt>
          <dd>
            {selectedTrack
              ? formatNumber(
                  selectedTrack
                    .getMetaEvents()
                    .filter((event) => event.type === TEMPO_META_EVENT_TYPE)
                    .length,
                )
              : "n/a"}
          </dd>
        </dl>
      </section>

      <section className="debug-panel__section">
        <h2>Audio info</h2>
        <dl>
          <dt>Filename</dt>
          <dd>{audioFileName ?? "none"}</dd>
          <dt>Loaded</dt>
          <dd>{audio ? "yes" : "no"}</dd>
          <dt>Length</dt>
          <dd>{formatMinutes(audioDurationMs)}</dd>
          <dt>Current time</dt>
          <dd>{formatMinutes(currentAudioTimeMs)}</dd>
          <dt>Length in ticks</dt>
          <dd>{audio ? formatNumber(audioTotalTicks) : "n/a"}</dd>
        </dl>
      </section>

      <section className="debug-panel__section">
        <h2>Playback context</h2>
        <dl>
          <dt>Can play</dt>
          <dd>{canPlay ? "yes" : "no"}</dd>
          <dt>Current tick</dt>
          <dd>{formatNumber(playheadTick)}</dd>
          <dt>Maximum tick</dt>
          <dd>{formatNumber(totalTicks)}</dd>
          <dt>Playback</dt>
          <dd>{isPlaying ? "playing" : "stopped"}</dd>
          <dt>Current percentage</dt>
          <dd>
            {totalTicks > 0
              ? `${((playheadTick / totalTicks) * 100).toFixed(1)}%`
              : "n/a"}
          </dd>
        </dl>
      </section>

      <section className="debug-panel__section">
        <h2>Event handlers</h2>
        <dl>
          <dt>Keys pressed</dt>
          <dd>{pressedKeys.length > 0 ? pressedKeys.join(", ") : "none"}</dd>
          <dt>Events shown</dt>
          <dd>{events.length}</dd>
        </dl>
        <p className="muted">Recent clicks and keyboard events</p>
        <ul className="event-list">
          {events.length > 0 ? (
            events.map((event, index) => (
              <li key={`${event.time}-${index}`}>
                [{event.time}] {event.type}: {event.detail}
              </li>
            ))
          ) : (
            <li className="muted">No events captured yet.</li>
          )}
        </ul>
      </section>

      <CameraDebugSection
        key={chartView?.constructor.name ?? "no-camera"}
        chartView={chartView}
      />
    </aside>
  );
}

export function DebugWindow({ onClose }: DebugWindowProps) {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [pressedKeys, setPressedKeys] = useState<string[]>([]);
  const activeChartView = Platform.services.get<ActiveChartViewService>(
    "editor.active-chart-view",
  );
  const chartView = useSyncExternalStore(
    activeChartView.subscribe,
    activeChartView.getSnapshot,
    activeChartView.getSnapshot,
  );

  useEffect(() => {
    const record = (type: string, detail: string): void => {
      const time = new Date().toLocaleTimeString();
      setEvents((current) => [...current, { type, detail, time }].slice(-30));
    };
    const handleClick = (event: MouseEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      record(
        "click",
        target
          ? `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ""}`
          : "unknown",
      );
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      setPressedKeys((current) =>
        current.includes(event.key) ? current : [...current, event.key],
      );
      record("keydown", `${event.key} (${event.code})`);
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      setPressedKeys((current) => current.filter((key) => key !== event.key));
      record("keyup", `${event.key} (${event.code})`);
    };
    const handleBlur = (): void => setPressedKeys([]);

    window.addEventListener("click", handleClick, true);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  return (
    <DebugPanel
      onClose={onClose}
      events={events}
      pressedKeys={pressedKeys}
      chartView={chartView}
    />
  );
}
