import { useCallback } from "react";
import type { RefObject } from "react";
import { xToTick } from "./util";

interface UseTimelineBoundsOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  timelineTicks: number;
  onScrub: (tick: number) => void;
}

export function useTimelineBounds({
  canvasRef,
  timelineTicks,
  onScrub,
}: UseTimelineBoundsOptions) {
  return useCallback(
    (clientX: number): void => {
      if (timelineTicks <= 0) {
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const bounds = canvas.getBoundingClientRect();
      const tick = xToTick(clientX - bounds.left, bounds.width, timelineTicks);
      onScrub(tick);
    },
    [canvasRef, onScrub, timelineTicks],
  );
}
