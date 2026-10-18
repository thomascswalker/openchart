import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import classNames from "classnames";
import styles from "./splitter.module.css";

/** Horizontal places panes side by side; vertical stacks them. */
type SplitterOrientation = "horizontal" | "vertical";

interface SplitterProps {
  children: [ReactNode, ReactNode];
  orientation?: SplitterOrientation;
  initialSize?: number;
  minFirstSize?: number;
  minSecondSize?: number;
}

interface DragState {
  pointerId: number;
  startPosition: number;
  startSize: number;
}

function Splitter({
  children,
  orientation = "horizontal",
  initialSize = 400,
  minFirstSize = 120,
  minSecondSize = 160,
}: SplitterProps) {
  const [firstSize, setFirstSize] = useState(initialSize);
  const drag = useRef<DragState | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isHorizontal = orientation === "horizontal";

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startPosition: isHorizontal ? event.clientX : event.clientY,
      startSize: firstSize,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const activeDrag = drag.current;
    const container = containerRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId || !container) {
      return;
    }

    const bounds = container.getBoundingClientRect();
    const totalSize = isHorizontal ? bounds.width : bounds.height;
    const position = isHorizontal ? event.clientX : event.clientY;
    const maximumSize = Math.max(minFirstSize, totalSize - minSecondSize);
    setFirstSize(
      Math.min(
        maximumSize,
        Math.max(
          minFirstSize,
          activeDrag.startSize + position - activeDrag.startPosition,
        ),
      ),
    );
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) {
      drag.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const decrementKey = isHorizontal ? "ArrowLeft" : "ArrowUp";
    const incrementKey = isHorizontal ? "ArrowRight" : "ArrowDown";
    if (event.key !== decrementKey && event.key !== incrementKey) {
      return;
    }

    event.preventDefault();
    const bounds = containerRef.current?.getBoundingClientRect();
    const totalSize = bounds
      ? isHorizontal
        ? bounds.width
        : bounds.height
      : Infinity;
    const maximumSize = Math.max(minFirstSize, totalSize - minSecondSize);
    setFirstSize((current) =>
      Math.min(
        maximumSize,
        Math.max(
          minFirstSize,
          current + (event.key === incrementKey ? 16 : -16),
        ),
      ),
    );
  };

  return (
    <div
      ref={containerRef}
      className={classNames(styles.splitter, {
        [styles.horizontal]: isHorizontal,
        [styles.vertical]: !isHorizontal,
      })}
    >
      <div
        className={styles.pane}
        style={{
          flexBasis: `${firstSize}px`,
          minWidth: isHorizontal ? minFirstSize : undefined,
          minHeight: isHorizontal ? undefined : minFirstSize,
        }}
      >
        {children[0]}
      </div>
      <div
        className={styles.separator}
        role="separator"
        aria-label="Resize panels"
        aria-orientation={isHorizontal ? "vertical" : "horizontal"}
        aria-valuenow={firstSize}
        aria-valuemin={minFirstSize}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <span className={styles.grip} aria-hidden="true">
          <span className={styles.gripDot} />
          <span className={styles.gripDot} />
          <span className={styles.gripDot} />
        </span>
      </div>
      <div
        className={styles.pane}
        style={{
          flexBasis: 0,
          minWidth: isHorizontal ? minSecondSize : undefined,
          minHeight: isHorizontal ? undefined : minSecondSize,
        }}
      >
        {children[1]}
      </div>
    </div>
  );
}

export default Splitter;
export type { SplitterProps, SplitterOrientation };
