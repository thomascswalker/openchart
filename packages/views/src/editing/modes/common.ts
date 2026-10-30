export function isInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

export function validTick(tick: number): boolean {
  return Number.isSafeInteger(tick) && tick >= 0;
}

export function validSpan(startTick: number, endTick: number): boolean {
  return (
    validTick(startTick) && Number.isSafeInteger(endTick) && endTick > startTick
  );
}
