export function getCameraTickForPlayhead(
  playheadTick: number,
  cameraTick: number,
  visibleTickSpan: number,
  followMarginRatio = 0.1,
): number | null {
  if (!Number.isFinite(visibleTickSpan) || visibleTickSpan <= 0) {
    return null;
  }

  const followMargin = visibleTickSpan * followMarginRatio;
  if (
    playheadTick >= cameraTick + followMargin &&
    playheadTick <= cameraTick + visibleTickSpan - followMargin
  ) {
    return null;
  }

  return Math.max(0, playheadTick - followMargin);
}
