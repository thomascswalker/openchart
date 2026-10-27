export abstract class BaseCoordinates {
  public abstract getSnapTicks(): number;

  protected abstract isSnapEnabled(): boolean;

  public snapTick(tick: number): number {
    if (!this.isSnapEnabled()) return Math.max(0, Math.round(tick));
    const snapTicks = this.getSnapTicks();
    return Number.isFinite(snapTicks) && snapTicks > 0
      ? Math.max(0, Math.floor(tick / snapTicks) * snapTicks)
      : Math.max(0, Math.round(tick));
  }
}
