import { useRef } from "react";
import { runAction } from "../../../actions/execute";
import styles from "./Timeline.module.css";
import { useTimelineBounds } from "./useTimelineBounds";

interface TimelineViewportProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrubFrameRef: React.RefObject<number | null>;
  timelineTicks: number;
  isPlaying: boolean;
  onScrub: (tick: number) => void;
}

const TimelineViewport = ({
  canvasRef,
  containerRef,
  scrubFrameRef,
  timelineTicks,
  isPlaying,
  onScrub,
}: TimelineViewportProps) => {
  const draggingRef = useRef(false);
  const pendingScrubXRef = useRef<number | null>(null);
  const scrubToClientX = useTimelineBounds({
    canvasRef,
    timelineTicks,
    onScrub,
  });

  const queueScrubToClientX = (clientX: number): void => {
    pendingScrubXRef.current = clientX;
    if (scrubFrameRef.current !== null) {
      return;
    }
    scrubFrameRef.current = requestAnimationFrame(() => {
      scrubFrameRef.current = null;
      const pendingX = pendingScrubXRef.current;
      pendingScrubXRef.current = null;
      if (pendingX !== null) {
        scrubToClientX(pendingX);
      }
    });
  };

  const flushPendingScrub = (): void => {
    if (scrubFrameRef.current !== null) {
      cancelAnimationFrame(scrubFrameRef.current);
      scrubFrameRef.current = null;
    }
    const pendingX = pendingScrubXRef.current;
    pendingScrubXRef.current = null;
    if (pendingX !== null) {
      scrubToClientX(pendingX);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;

    if (isPlaying) {
      runAction("playback.pause");
    }

    queueScrubToClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) {
      return;
    }

    queueScrubToClientX(event.clientX);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) {
      return;
    }

    pendingScrubXRef.current = event.clientX;
    flushPendingScrub();
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      ref={containerRef}
      className={styles["track"]}
      data-testid="viewport-timeline"
    >
      <canvas
        ref={canvasRef}
        className={styles["canvas"]}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
};

export default TimelineViewport;
