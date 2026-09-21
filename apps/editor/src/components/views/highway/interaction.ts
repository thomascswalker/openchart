export const minimumMidiNoteDurationTicks = 1;

export function getHighwayWheelTick(
  playheadTick: number,
  deltaY: number,
  ppqn: number,
  ticksPerPixel: number,
): number {
  return Math.max(0, playheadTick - deltaY * ppqn * ticksPerPixel);
}
