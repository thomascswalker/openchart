export type ScrollDeviceType = "mouse" | "trackpad";

export function getScrollDevice(e: WheelEvent): ScrollDeviceType {
  if (e.deltaMode !== 0) {
    return "mouse";
  }

  const absX = Math.abs(e.deltaX);
  const absY = Math.abs(e.deltaY);

  if (e.ctrlKey || e.metaKey) {
    return "trackpad";
  }

  if (absX > 0 && absY > 0) {
    return "trackpad";
  }

  const isStandardMouseStep = absY % 20 === 0 && absY >= 60;

  if (isStandardMouseStep && absX === 0) {
    return "mouse";
  }

  return "trackpad";
}
