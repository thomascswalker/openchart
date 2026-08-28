import { useState, useEffect } from "react";
import { useEditor } from "./Context";
import { ChartViewHost } from "./views/ChartViewHost";
import { CHART_VIEWS } from "./views/ChartViews";
import { SnapDenominators } from "./views/pianoRoll/constants";

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}

export const Viewport = () => {
  const { midiData, selectedTrackIndex } = useEditor();
  const [activeViewId, setActiveViewId] = useState(CHART_VIEWS[0].id);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapDenominator, setSnapDenominator] = useState(4);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key.toLowerCase() !== "s" || isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setSnapEnabled((enabled) => !enabled);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const activeView =
    CHART_VIEWS.find((view) => view.id === activeViewId) ?? CHART_VIEWS[0];

  const selectedTrack =
    midiData && selectedTrackIndex !== null
      ? midiData.tracks[selectedTrackIndex]
      : null;

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
          <label className="midi-view__snap">
            <input
              type="checkbox"
              checked={snapEnabled}
              onChange={(event) => {
                setSnapEnabled(event.target.checked);
              }}
            />
            Snap
          </label>

          <select
            value={snapDenominator}
            disabled={!snapEnabled}
            onChange={(event) => {
              setSnapDenominator(Number(event.target.value));
            }}
          >
            {SnapDenominators.map((denominator) => (
              <option key={denominator} value={denominator}>
                1/{denominator}
              </option>
            ))}
          </select>

          <select
            value={activeViewId}
            onChange={(event) => {
              setActiveViewId(event.target.value);
            }}
          >
            {CHART_VIEWS.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="midi-view__body">
        <ChartViewHost
          createRenderer={activeView.createRenderer}
          state={{
            midi: midiData,
            selectedTrackIndex,
            snap: { enabled: snapEnabled, denominator: snapDenominator },
          }}
        />
      </div>
    </section>
  );
};
