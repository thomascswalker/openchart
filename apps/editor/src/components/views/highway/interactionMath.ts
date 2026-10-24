export function getPhrasePointerAction(
  phraseHit: boolean,
  insidePhraseBand: boolean,
  noteHit: boolean,
): "edit-phrase" | "create-phrase" | "marquee" {
  if (phraseHit) return "edit-phrase";
  return insidePhraseBand && !noteHit ? "create-phrase" : "marquee";
}

export function getPhraseAutoScrollDelta(
  pointerY: number,
  viewportHeight: number,
  operation: "resize-start" | "resize-end",
  edgeMargin: number,
  maximumTicks: number,
): number {
  if (viewportHeight <= 0 || edgeMargin <= 0 || maximumTicks <= 0) return 0;
  const distance =
    operation === "resize-end" ? pointerY : viewportHeight - pointerY;
  if (distance >= edgeMargin) return 0;
  const proximity = Math.max(
    0,
    Math.min(1, (edgeMargin - distance) / edgeMargin),
  );
  return (operation === "resize-end" ? 1 : -1) * maximumTicks * proximity;
}

export function getHighwayWheelTick(
  cameraTick: number,
  deltaY: number,
  ppqn: number,
  ticksPerPixel: number,
): number {
  return Math.max(0, cameraTick - deltaY * ppqn * ticksPerPixel);
}

export function getHighwaySteppedTick(
  playheadTick: number,
  direction: -1 | 1,
  snapTicks: number,
  snapEnabled: boolean,
): number {
  if (!snapEnabled || snapTicks <= 0) {
    return Math.max(0, playheadTick + direction * snapTicks);
  }
  const step =
    direction > 0
      ? Math.floor(playheadTick / snapTicks) + 1
      : Math.ceil(playheadTick / snapTicks) - 1;
  return Math.max(0, step * snapTicks);
}

export function getHighwaySnapDenominator(
  current: number,
  direction: -1 | 1,
  choices: readonly number[],
): number {
  if (choices.length === 0) return current;
  let index = choices.indexOf(current);
  if (index < 0) {
    index = choices.reduce(
      (nearest, value, candidate) =>
        Math.abs(value - current) < Math.abs(choices[nearest] - current)
          ? candidate
          : nearest,
      0,
    );
  }
  return choices[Math.max(0, Math.min(choices.length - 1, index + direction))];
}

export function getHighwayDragTarget(
  initialTick: number,
  initialLane: number,
  tickDelta: number,
  laneDelta: number,
  snapTicks: number,
  snapEnabled: boolean,
  laneCount: number,
): { tick: number; lane: number } {
  const targetTick = initialTick + tickDelta;
  const tick =
    snapEnabled && snapTicks > 0
      ? Math.floor(targetTick / snapTicks) * snapTicks
      : Math.round(targetTick);
  return {
    tick: Math.max(0, tick),
    lane: Math.max(0, Math.min(laneCount - 1, initialLane + laneDelta)),
  };
}
