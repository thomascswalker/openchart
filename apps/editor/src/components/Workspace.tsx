import { useState } from "react";
import type { ChartView } from "./views/ChartViews";
import { Viewport } from "./Viewport";
import { TrackList } from "./Tracklist";
import { DebugWindow } from "./DebugWindow";

interface WorkspaceProps {
  debugVisible: boolean;
  onDebugClose: () => void;
}

export const Workspace = ({ debugVisible, onDebugClose }: WorkspaceProps) => {
  const [chartView, setChartView] = useState<ChartView | null>(null);

  return (
    <div
      className={`midi-workspace${debugVisible ? " midi-workspace--debug" : ""}`}
    >
      <TrackList />
      <Viewport onChartViewReady={setChartView} />
      {debugVisible ? (
        <DebugWindow onClose={onDebugClose} chartView={chartView} />
      ) : null}
    </div>
  );
};
