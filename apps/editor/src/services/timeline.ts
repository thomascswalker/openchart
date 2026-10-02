import {
  msToTicks,
  ticksToMs,
  type Midi,
  type TempoChange,
} from "@midiedit/core";
import type { PlaybackFeedback } from "../audio/usePlaybackFeedback";
import { AudioService } from "./audio";

export interface Timeline {
  isPlaying: boolean;
  canPlay: boolean;
  playbackTick: number;
  totalTimelineTicks: number;
  totalAudioTicks: number;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekStart: () => void;
  seekEnd: () => void;
  setPlaybackTick: (tick: number) => void;
  refresh: () => void;
}

export function snapToPreviousTimelineBoundary(
  tick: number,
  ppqn: number,
  denominator: number,
  snapEnabled: boolean,
): number {
  const snapTicks = (ppqn * 4) / denominator;
  return snapEnabled && snapTicks > 0
    ? Math.max(0, Math.floor(tick / snapTicks) * snapTicks)
    : Math.max(0, tick);
}

export class TimelineService {
  static dependencies = ["audio"];

  private audioService: AudioService;
  private audioUnsubscribe: (() => void) | null = null;
  private listeners = new Set<() => void>();
  private midiData: Midi | null | undefined;
  private feedback: PlaybackFeedback = {
    start: () => undefined,
    stop: () => undefined,
    seek: () => undefined,
    updateTick: () => undefined,
    isMetronomeEnabled: false,
    isClapEnabled: false,
    toggleMetronome: () => undefined,
    toggleClap: () => undefined,
    setActiveView: () => undefined,
    previewTrack: () => undefined,
    previewNotes: () => undefined,
    stopPreview: () => undefined,
  };
  private snapEnabled = true;
  private snapDenominator = 4;
  private isPlaying = false;
  private canPlay = false;
  private playbackTick = 0;
  private midiTotalTicks = 0;
  private ppqn = 480;
  private tempoChanges: TempoChange[] = [
    { tick: 0, microsecondsPerQuarterNote: 500_000 },
  ];
  private lastAudio: ReturnType<AudioService["getSnapshot"]>["audio"];
  private lastAudioEndCount = 0;
  private animationFrame: number | null = null;
  private lastFrameMs: number | null = null;
  private configured = false;
  private snapshot!: Timeline;

  constructor(audioService: AudioService) {
    this.audioService = audioService;
    const audioSnapshot = audioService.getSnapshot();
    this.lastAudio = audioSnapshot.audio;
    this.lastAudioEndCount = audioSnapshot.endCount;
    this.connectToAudio();
    this.snapshot = this.createSnapshot();
  }

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public readonly getSnapshot = (): Timeline => this.snapshot;

  public readonly configure = (options: {
    midiData: Midi | null | undefined;
    feedback: PlaybackFeedback;
    snapEnabled: boolean;
    snapDenominator: number;
  }): void => {
    this.connectToAudio();
    const audio = this.audioService.getSnapshot().audio;
    const documentChanged = this.midiData !== options.midiData;
    const audioChanged = this.lastAudio !== audio;
    this.midiData = options.midiData;
    this.feedback = options.feedback;
    this.snapEnabled = options.snapEnabled;
    this.snapDenominator = options.snapDenominator;
    this.ppqn = this.midiData?.header.division ?? 480;
    this.tempoChanges = this.midiData?.getTempoChanges() ?? [
      { tick: 0, microsecondsPerQuarterNote: 500_000 },
    ];

    if (this.configured && (documentChanged || audioChanged)) {
      this.stopPlayback();
      this.playbackTick = 0;
    }
    this.configured = true;
    this.lastAudio = audio;
    this.refresh();
  };

  public readonly refresh = (): void => {
    let maxTick = 0;
    let hasNotes = false;
    for (const track of this.midiData?.tracks ?? []) {
      for (const note of track.getNotes()) {
        hasNotes = true;
        maxTick = Math.max(maxTick, note.end);
      }
    }
    this.midiTotalTicks = Math.max(maxTick, hasNotes ? 1 : 0);
    this.canPlay =
      hasNotes || this.audioService.getSnapshot().audio !== undefined;
    this.publish();
  };

  public readonly setPlaybackTick = (tick: number): void => {
    this.playbackTick = Math.max(0, tick);
    this.audioService.seek(
      ticksToMs(this.playbackTick, this.ppqn, this.tempoChanges) / 1_000,
    );
    this.feedback.seek(this.playbackTick);
    this.publish();
  };

  public readonly play = (): void => {
    if (!this.canPlay) return;
    const totalTicks = this.totalTimelineTicks();
    if (totalTicks > 0 && this.playbackTick >= totalTicks) {
      this.setPlaybackTick(0);
    }
    this.isPlaying = true;
    this.feedback.start(this.playbackTick);
    this.audioService.play();
    this.lastFrameMs = null;
    this.requestNextFrame();
    this.publish();
  };

  public readonly pause = (): void => {
    this.stopPlayback();
    if (this.snapEnabled) {
      this.setPlaybackTick(
        snapToPreviousTimelineBoundary(
          this.playbackTick,
          this.ppqn,
          this.snapDenominator,
          true,
        ),
      );
    }
  };

  public readonly togglePlay = (): void => {
    if (this.isPlaying) this.pause();
    else this.play();
  };

  public readonly seekStart = (): void => {
    if (!this.isPlaying) this.setPlaybackTick(0);
  };

  public readonly seekEnd = (): void => {
    if (!this.isPlaying) this.setPlaybackTick(this.midiTotalTicks);
  };

  public dispose(): void {
    this.stopPlayback();
    this.audioUnsubscribe?.();
    this.audioUnsubscribe = null;
    this.listeners.clear();
  }

  private connectToAudio(): void {
    if (!this.audioUnsubscribe) {
      this.audioUnsubscribe = this.audioService.subscribe(this.onAudioChanged);
    }
  }

  private readonly onAudioChanged = (): void => {
    const audioSnapshot = this.audioService.getSnapshot();
    if (this.configured && this.lastAudio !== audioSnapshot.audio) {
      this.stopPlayback();
      this.playbackTick = 0;
    } else if (
      this.isPlaying &&
      audioSnapshot.endCount !== this.lastAudioEndCount
    ) {
      this.stopPlayback();
      this.setPlaybackTick(0);
    }
    this.lastAudio = audioSnapshot.audio;
    this.lastAudioEndCount = audioSnapshot.endCount;
    this.refresh();
  };

  private stopPlayback(): void {
    this.isPlaying = false;
    this.audioService.pause();
    this.feedback.stop();
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.lastFrameMs = null;
    this.publish();
  }

  private requestNextFrame(): void {
    if (!this.isPlaying) return;
    this.animationFrame = requestAnimationFrame(this.step);
  }

  private readonly step = (frameTimeMs: number): void => {
    const audio = this.audioService.getSnapshot().audio;
    const totalTicks = this.totalTimelineTicks();
    if (audio) {
      this.playbackTick = msToTicks(
        audio.currentTime * 1_000,
        this.ppqn,
        this.tempoChanges,
      );
    } else {
      if (this.lastFrameMs !== null) {
        const elapsedMs = frameTimeMs - this.lastFrameMs;
        const currentMs =
          ticksToMs(this.playbackTick, this.ppqn, this.tempoChanges) +
          elapsedMs;
        const nextTick = msToTicks(currentMs, this.ppqn, this.tempoChanges);
        this.playbackTick =
          totalTicks > 0 && nextTick >= totalTicks ? totalTicks : nextTick;
      }
      this.lastFrameMs = frameTimeMs;
    }

    this.feedback.updateTick(this.playbackTick);
    this.publish();
    if (totalTicks > 0 && this.playbackTick >= totalTicks) {
      this.stopPlayback();
      return;
    }
    this.requestNextFrame();
  };

  private totalAudioTicks(): number {
    const duration = this.audioService.getSnapshot().duration;
    return duration > 0 ? msToTicks(duration, this.ppqn, this.tempoChanges) : 0;
  }

  private totalTimelineTicks(): number {
    return Math.max(this.midiTotalTicks, this.totalAudioTicks());
  }

  private createSnapshot(): Timeline {
    return {
      isPlaying: this.isPlaying,
      canPlay: this.canPlay,
      playbackTick: this.playbackTick,
      totalTimelineTicks: this.totalTimelineTicks(),
      totalAudioTicks: this.totalAudioTicks(),
      play: this.play,
      pause: this.pause,
      togglePlay: this.togglePlay,
      seekStart: this.seekStart,
      seekEnd: this.seekEnd,
      setPlaybackTick: this.setPlaybackTick,
      refresh: this.refresh,
    };
  }

  private publish(): void {
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
  }
}
