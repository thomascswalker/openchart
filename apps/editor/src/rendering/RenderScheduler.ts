export type RenderCallback = () => void;

/** Coalesces invalidations into one render callback per display frame. */
export class RenderScheduler {
  private frame: number | null = null;
  private disposed = false;

  public constructor(private readonly callback: RenderCallback) {}

  public request(): void {
    if (this.disposed || this.frame !== null) {
      return;
    }

    const run = (): void => {
      this.frame = null;
      if (!this.disposed) {
        this.callback();
      }
    };

    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      this.frame = window.requestAnimationFrame(run);
    } else {
      this.frame = Number(setTimeout(run, 0));
    }
  }

  public cancel(): void {
    if (this.frame === null) {
      return;
    }

    if (typeof window !== "undefined" && window.cancelAnimationFrame) {
      window.cancelAnimationFrame(this.frame);
    } else {
      clearTimeout(this.frame);
    }
    this.frame = null;
  }

  public dispose(): void {
    this.disposed = true;
    this.cancel();
  }
}
