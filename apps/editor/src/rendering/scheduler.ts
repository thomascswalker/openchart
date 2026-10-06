export type RenderCallback = () => void;

// Schedules and manages render callbacks using requestAnimationFrame
// Provides methods to request, cancel, and dispose of render callbacks.
export class RenderScheduler {
  // Currently scheduled frame ID (from requestAnimationFrame)
  private frame: number | null = null;
  // Flag indicating whether the scheduler has been disposed
  private disposed = false;
  // The render callback to be invoked on each scheduled frame
  private readonly callback: RenderCallback;

  public constructor(callback: RenderCallback) {
    this.callback = callback;
  }

  public request(): void {
    // If the scheduler has been disposed or a frame is already scheduled, do nothing.
    if (this.disposed || this.frame !== null) {
      return;
    }

    // Function called on the next animation frame
    const run = (): void => {
      this.frame = null;
      if (!this.disposed) {
        this.callback();
      }
    };

    // Schedule the next animation frame
    this.frame = window.requestAnimationFrame(run);
  }

  public cancel(): void {
    // If no frame is currently scheduled, do nothing.
    if (this.frame === null) {
      return;
    }

    // Cancel the currently scheduled animation frame
    window.cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  public dispose(): void {
    // Mark the scheduler as disposed and cancel any scheduled frame
    this.disposed = true;
    this.cancel();
  }
}
