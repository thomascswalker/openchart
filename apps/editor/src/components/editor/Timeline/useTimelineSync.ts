import { useCallback, useMemo } from "react";
import { usePlaybackSelector } from "#usePlayback";
import { runAction } from "../../../actions/execute";
import type { AnyChartView } from "../../views/ChartViews";
import {
  DefaultTempoEvents,
  DefaultTimeSignatureEvents,
  getTimelinePosition,
} from "./util";
import type { Midi } from "@openchart/midi";

interface TimelineSyncOptions {
  midi: Midi | null;
  chartViews: AnyChartView[];
}

export function useTimelineSync({ midi, chartViews }: TimelineSyncOptions) {
  const isPlaying = usePlaybackSelector((snapshot) => snapshot.isPlaying);
  const playbackTick = usePlaybackSelector((snapshot) => snapshot.playbackTick);
  const totalTimelineTicks = usePlaybackSelector(
    (snapshot) => snapshot.totalTimelineTicks,
  );
  const timelineTicks = Math.max(totalTimelineTicks, playbackTick);

  const syncPlayhead = useCallback(
    (tick: number): void => {
      runAction("playback.set-tick", tick);

      for (const chartView of chartViews) {
        const cameraTick = chartView.getCameraTickForPlayhead(tick);
        if (cameraTick !== null) {
          chartView.setCameraTick(cameraTick);
        }
      }
    },
    [chartViews],
  );

  const tempo = useMemo(
    () => midi?.getTempoEvents() ?? DefaultTempoEvents,
    [midi],
  );
  const sigs = useMemo(
    () => midi?.getTimeSignatureEvents() ?? DefaultTimeSignatureEvents,
    [midi],
  );
  const position = getTimelinePosition(
    playbackTick,
    midi?.header.division ?? 480,
    tempo,
    sigs,
  );

  return {
    isPlaying,
    playbackTick,
    timelineTicks,
    syncPlayhead,
    position,
  };
}
