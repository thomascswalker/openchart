import { useState } from "react";
import type { ChartView } from "./views/ChartViews";
import { Viewport } from "./Viewport";
import { DebugWindow } from "./dialogs/DebugDialog";

interface WorkspaceProps {
  debugVisible: boolean;
  onDebugClose: () => void;
  onChartViewReady: (view: ChartView | null) => void;
}

export const Workspace = ({
  debugVisible,
  onDebugClose,
  onChartViewReady,
}: WorkspaceProps) => {
  const [chartView, setChartView] = useState<ChartView | null>(null);
  const handleChartViewReady = (view: ChartView | null): void => {
    setChartView(view);
    onChartViewReady(view);
  };

  return (
    <div
      className={`midi-workspace${debugVisible ? " midi-workspace--debug" : ""}`}
    >
      <Viewport onChartViewReady={handleChartViewReady} />
      {debugVisible ? (
        <DebugWindow onClose={onDebugClose} chartView={chartView} />
      ) : null}
    </div>
  );
};
