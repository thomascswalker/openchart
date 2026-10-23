import { useDocument } from "../../../hooks/useDocument";
import type { AnyChartView } from "../../views/ChartViews";
import TimelineControls from "./TimelineControls";
import styles from "./Timeline.module.css";
import TimelineViewport from "./TimelineViewport";
import { useTimelineRender } from "./useTimelineRender";
import { useTimelineSync } from "./useTimelineSync";

interface TimelineProps {
  chartViews: AnyChartView[];
}

export function Timeline({ chartViews }: TimelineProps) {
  const { midi } = useDocument();
  const { isPlaying, playbackTick, timelineTicks, syncPlayhead, position } =
    useTimelineSync({ midi, chartViews });
  const { canvasRef, containerRef, scrubFrameRef } = useTimelineRender({
    chartViews,
    timelineTicks,
    playbackTick,
  });

  return (
    <div className={styles["timeline"]}>
      <TimelineControls position={position} isPlaying={isPlaying} />
      <TimelineViewport
        canvasRef={canvasRef}
        containerRef={containerRef}
        scrubFrameRef={scrubFrameRef}
        timelineTicks={timelineTicks}
        isPlaying={isPlaying}
        onScrub={syncPlayhead}
      />
    </div>
  );
}
