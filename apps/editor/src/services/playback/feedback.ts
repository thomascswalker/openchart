import type {
  PitchRange,
  PreviewNote,
} from "../../audio/PlaybackFeedbackEngine";
import type { PlaybackFeedback } from "../../audio/usePlaybackFeedback";

export interface PlaybackFeedbackSnapshot {
  isMetronomeEnabled: boolean;
  isClapEnabled: boolean;
}

export class PlaybackFeedbackService {
  private readonly listeners = new Set<() => void>();
  private feedback: PlaybackFeedback | null = null;
  private snapshot: PlaybackFeedbackSnapshot = {
    isMetronomeEnabled: false,
    isClapEnabled: false,
  };

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public readonly getSnapshot = (): PlaybackFeedbackSnapshot => this.snapshot;

  public readonly setFeedback = (feedback: PlaybackFeedback | null): void => {
    this.feedback = feedback;
    const next = {
      isMetronomeEnabled: feedback?.isMetronomeEnabled ?? false,
      isClapEnabled: feedback?.isClapEnabled ?? false,
    };
    if (
      next.isMetronomeEnabled === this.snapshot.isMetronomeEnabled &&
      next.isClapEnabled === this.snapshot.isClapEnabled
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  };

  public readonly start = (tick: number): void =>
    this.requireFeedback().start(tick);
  public readonly stop = (): void => this.requireFeedback().stop();
  public readonly seek = (tick: number): void =>
    this.requireFeedback().seek(tick);
  public readonly updateTick = (tick: number): void =>
    this.requireFeedback().updateTick(tick);
  public readonly toggleMetronome = (): void =>
    this.requireFeedback().toggleMetronome();
  public readonly toggleClap = (): void => this.requireFeedback().toggleClap();
  public readonly setActiveView = (viewId: string): void =>
    this.requireFeedback().setActiveView(viewId);
  public readonly previewTrack = (
    trackIndex?: number,
    range?: PitchRange,
  ): void => this.requireFeedback().previewTrack(trackIndex, range);
  public readonly previewNotes = (
    notes: readonly PreviewNote[],
    range?: PitchRange,
  ): void => this.requireFeedback().previewNotes(notes, range);
  public readonly stopPreview = (): void =>
    this.requireFeedback().stopPreview();

  private requireFeedback(): PlaybackFeedback {
    if (!this.feedback) throw new Error("Playback feedback is unavailable.");
    return this.feedback;
  }
}
