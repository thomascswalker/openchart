export type ScrollGesture = "mouse-zoom" | "trackpad-pan" | "trackpad-pinch";

export interface WheelInput {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
}

export function getScrollGesture(event: WheelInput): ScrollGesture {
  if (event.deltaMode !== 0) {
    return "mouse-zoom";
  }

  const absX = Math.abs(event.deltaX);
  const absY = Math.abs(event.deltaY);

  if (event.ctrlKey || event.metaKey) {
    return "trackpad-pinch";
  }

  if (absX > 0 && absY > 0) {
    return "trackpad-pan";
  }

  const isStandardMouseStep =
    (absX === 0 && absY % 20 === 0 && absY >= 60) ||
    (absY === 0 && absX % 20 === 0 && absX >= 60);

  if (isStandardMouseStep && absX === 0) {
    return "mouse-zoom";
  }

  return "trackpad-pan";
}
