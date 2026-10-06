import {
  msToTicks,
  ticksToMs,
  type Midi,
  type MidiNote,
  type TempoChange,
} from "@midiedit/core";
import { Difficulty, SongView } from "@midiedit/views";
import {
  Soundboard,
  type SoundboardSettings,
  type PitchRange,
  type PreviewNote,
} from "../audio/soundboard";
import { AudioService } from "./audio";
import type { DocumentService } from "./document";
import type { ApplicationSettings } from "./settings";
import { IStatefulService } from "../platform/services";

export interface PlaybackSnapshot {
  isPlaying: boolean;
  canPlay: boolean;
  playbackTick: number;
  totalTimelineTicks: number;
  totalAudioTicks: number;
  isMetronomeEnabled: boolean;
  isClapEnabled: boolean;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekStart: () => void;
  seekEnd: () => void;
  setPlaybackTick: (tick: number) => void;
  refresh: () => void;
  toggleMetronome: () => void;
  toggleClap: () => void;
  setActiveView: (viewId: string) => void;
  /** Preview the current track; an explicit range overrides the settings range. */
  previewTrack: (trackIndex?: number, range?: PitchRange) => void;
  /** Preview an explicit piano-roll selection; an explicit range filters that selection. */
  previewNotes: (notes: readonly PreviewNote[], range?: PitchRange) => void;
  stopPreview: () => void;
}

export interface PlaybackConfiguration {
  midiData: Midi | null | undefined;
  settings: ApplicationSettings;
  snapEnabled: boolean;
  snapDenominator: number;
  selectedInstrument: string;
  selectedDifficulty: Difficulty;
  selectedTrackIndex: number | null;
}

const DEFAULT_TEMPO: TempoChange[] = [
  { tick: 0, microsecondsPerQuarterNote: 500_000 },
];

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

function notesForHighway(
  midi: Midi | null | undefined,
  instrument: string,
  difficulty: Difficulty,
): readonly MidiNote[] {
  if (!midi) return [];
  const song = new SongView(midi);
  return (
    song.getInstrumentTrackView(instrument)?.getChart(difficulty)?.getNotes() ??
    []
  );
}

export class PlaybackService extends IStatefulService<PlaybackSnapshot> {
  static dependencies = ["audio", "document"];

  private audioService: AudioService;
  private engine = new Soundboard();
  private audioUnsubscribe: (() => void) | null = null;
  private documentUnsubscribe: (() => void) | undefined;
  private listeners = new Set<() => void>();
  private midiData: Midi | null | undefined;
  private settings: ApplicationSettings | null = null;
  private selectedInstrument = "LEAD GUITAR";
  private selectedDifficulty: Difficulty = Difficulty.Expert;
  private selectedTrackIndex: number | null = null;
  private metronomeEnabled = false;
  private defaultMetronome: boolean | null = null;
  private clapEnabled = false;
  private highwayActive = false;
  private highwayNotes: readonly MidiNote[] = [];
  private feedbackSettings: SoundboardSettings | null = null;
  private feedbackSettingsSource: ApplicationSettings["feedback"] | null = null;
  private snapEnabled = true;
  private snapDenominator = 4;
  private isPlaying = false;
  private canPlay = false;
  private playbackTick = 0;
  private midiTotalTicks = 0;
  private midiPlaybackEndTick = 0;
  private ppqn = 480;
  private tempoChanges: TempoChange[] = DEFAULT_TEMPO;
  private lastAudio: ReturnType<AudioService["getSnapshot"]>["audio"];
  private lastAudioEndCount = 0;
  private animationFrame: number | null = null;
  private lastFrameMs: number | null = null;
  private configured = false;
  private snapshot!: PlaybackSnapshot;

  constructor(audioService: AudioService, documentService?: DocumentService) {
    super();
    this.audioService = audioService;
    // Edits publish synchronously, so the end never lags behind the document.
    this.documentUnsubscribe = documentService?.subscribe(() => {
      if (this.configured) this.refresh(documentService.getData());
    });
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

  public readonly reset = (): void => {
    this.stopPlayback();
    this.engine.stopPreview();
    this.midiData = null;
    this.selectedInstrument = "LEAD GUITAR";
    this.selectedDifficulty = Difficulty.Expert;
    this.selectedTrackIndex = null;
    this.highwayNotes = [];
    this.midiTotalTicks = 0;
    this.midiPlaybackEndTick = 0;
    this.ppqn = 480;
    this.tempoChanges = DEFAULT_TEMPO;
    this.resetSession();
    this.publish();
  };

  public readonly getSnapshot = (): PlaybackSnapshot => this.snapshot;

  public readonly configure = (options: PlaybackConfiguration): void => {
    this.connectToAudio();
    const audio = this.audioService.getSnapshot().audio;
    const documentChanged = this.midiData !== options.midiData;
    const audioChanged = this.lastAudio !== audio;
    const selectionChanged =
      documentChanged ||
      this.selectedInstrument !== options.selectedInstrument ||
      this.selectedDifficulty !== options.selectedDifficulty;

    this.midiData = options.midiData;
    this.settings = options.settings;
    this.snapEnabled = options.snapEnabled;
    this.snapDenominator = options.snapDenominator;
    this.selectedInstrument = options.selectedInstrument;
    this.selectedDifficulty = options.selectedDifficulty;
    this.selectedTrackIndex = options.selectedTrackIndex;
    this.ppqn = this.midiData?.header.division ?? 480;
    this.tempoChanges = this.midiData?.getTempoChanges() ?? DEFAULT_TEMPO;
    if (selectionChanged || !this.configured) {
      this.highwayNotes = notesForHighway(
        this.midiData,
        this.selectedInstrument,
        this.selectedDifficulty,
      );
    }
    const defaultMetronome = options.settings.feedback.metronomeEnabled;
    if (this.defaultMetronome !== defaultMetronome) {
      this.defaultMetronome = defaultMetronome;
      this.metronomeEnabled = defaultMetronome;
    }
    this.configureEngine();

    if (this.configured && (documentChanged || audioChanged)) {
      this.stopPlayback();
      this.playbackTick = 0;
    }
    this.configured = true;
    this.lastAudio = audio;
    this.refresh();
  };

  public readonly refresh = (midiData?: Midi | null): void => {
    if (midiData !== undefined) {
      this.midiData = midiData;
      this.ppqn = midiData?.header.division ?? 480;
      this.tempoChanges = midiData?.getTempoChanges() ?? DEFAULT_TEMPO;
      this.highwayNotes = notesForHighway(
        midiData,
        this.selectedInstrument,
        this.selectedDifficulty,
      );
      this.configureEngine();
    }

    let maxTick = 0;
    let hasEvents = false;
    for (const track of this.midiData?.tracks ?? []) {
      if (track.events.length > 0) hasEvents = true;
      let trackEndTick = 0;
      for (const event of track.events) {
        trackEndTick += event.deltaTime;
      }
      maxTick = Math.max(maxTick, trackEndTick);
    }
    this.midiTotalTicks = Math.max(maxTick, hasEvents ? 1 : 0);
    if (hasEvents) {
      const timeSignatures = this.midiData?.getTimeSignatureChanges() ?? [];
      let numerator = 4;
      let denominator = 2;
      for (const change of timeSignatures) {
        if (change.tick > maxTick) break;
        numerator = change.numerator;
        denominator = change.denominator;
      }
      const measureTicks = this.ppqn * (4 / 2 ** denominator) * numerator;
      this.midiPlaybackEndTick = maxTick + 2 * measureTicks;
    } else {
      this.midiPlaybackEndTick = 0;
    }
    this.canPlay =
      hasEvents || this.audioService.getSnapshot().audio !== undefined;
    this.publish();
  };

  public readonly setPlaybackTick = (tick: number): void => {
    const nextTick = Math.max(0, tick);
    if (nextTick === this.playbackTick) return;
    this.playbackTick = nextTick;
    this.audioService.seek(
      ticksToMs(this.playbackTick, this.ppqn, this.tempoChanges) / 1_000,
    );
    this.engine.seek(this.playbackTick);
    this.publish();
  };

  public readonly play = (): void => {
    if (!this.canPlay) return;
    const totalTicks = this.totalTimelineTicks();
    if (totalTicks > 0 && this.playbackTick >= totalTicks) {
      this.setPlaybackTick(0);
    }
    this.isPlaying = true;
    this.engine.start(this.playbackTick);
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

  // The audio context must start inside the originating gesture (e.g. the
  // M/N key or menu click); a later effect is not user activation in hosts
  // such as the VSCode webview.
  public readonly toggleMetronome = (): void => {
    this.metronomeEnabled = !this.metronomeEnabled;
    if (this.metronomeEnabled) void this.engine.ensureStarted();
    this.configureEngine();
    this.publish();
  };

  public readonly toggleClap = (): void => {
    this.clapEnabled = !this.clapEnabled;
    if (this.clapEnabled) void this.engine.ensureStarted();
    this.configureEngine();
    this.publish();
  };

  public readonly setActiveView = (viewId: string): void => {
    const active = viewId === "highway";
    if (active === this.highwayActive) return;
    this.highwayActive = active;
    this.configureEngine();
  };

  public readonly previewTrack = (
    trackIndex: number = this.selectedTrackIndex ?? 0,
    range?: PitchRange,
  ): void => {
    const track = this.midiData?.tracks[trackIndex];
    if (!track) return;
    this.engine.previewTrack(
      track.getNotes().map((note) => ({
        pitch: note.note,
        startTick: note.start,
        endTick: note.end,
        velocity: note.velocity,
      })),
      range,
    );
  };

  public readonly previewNotes = (
    notes: readonly PreviewNote[],
    range?: PitchRange,
  ): void => this.engine.previewTrack(notes, range);

  public readonly stopPreview = (): void => this.engine.stopPreview();

  public dispose(): void {
    this.stopPlayback();
    this.engine.dispose();
    this.audioUnsubscribe?.();
    this.audioUnsubscribe = null;
    this.documentUnsubscribe?.();
    this.listeners.clear();
    this.resetSession();
  }

  // The service outlives the Playback component, so per-session state must
  // not leak into the next mount.
  private resetSession(): void {
    this.configured = false;
    this.settings = null;
    this.defaultMetronome = null;
    this.metronomeEnabled = false;
    this.clapEnabled = false;
    this.highwayActive = false;
    this.playbackTick = 0;
    this.feedbackSettings = null;
    this.snapshot = this.createSnapshot();
  }

  private configureEngine(): void {
    if (!this.settings) return;
    this.engine.configure({
      midi: this.midiData,
      ppqn: this.ppqn,
      tempoChanges: this.tempoChanges,
      timeSignatureChanges: this.midiData?.getTimeSignatureChanges() ?? [
        { tick: 0, numerator: 4, denominator: 2 },
      ],
      settings: this.getFeedbackSettings(this.settings),
      clapEnabled: this.clapEnabled,
      highwayActive: this.highwayActive,
      highwayNotes: this.highwayNotes,
      // A selected track change also resets the tracker so a newly active
      // viewport cannot replay stale crossings.
      highwayKey: `${this.selectedTrackIndex ?? -1}:${this.selectedInstrument}:${this.selectedDifficulty}`,
    });
  }

  // The engine detects settings changes by identity, so only rebuild when the
  // inputs actually change.
  private getFeedbackSettings(
    settings: ApplicationSettings,
  ): SoundboardSettings {
    if (
      !this.feedbackSettings ||
      this.feedbackSettingsSource !== settings.feedback ||
      this.feedbackSettings.metronomeEnabled !== this.metronomeEnabled
    ) {
      this.feedbackSettingsSource = settings.feedback;
      this.feedbackSettings = {
        ...settings.feedback,
        metronomeEnabled: this.metronomeEnabled,
      };
    }
    return this.feedbackSettings;
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
    this.engine.stop();
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

    this.engine.updateTick(this.playbackTick);
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
    return Math.max(this.midiPlaybackEndTick, this.totalAudioTicks());
  }

  private createSnapshot(): PlaybackSnapshot {
    return {
      isPlaying: this.isPlaying,
      canPlay: this.canPlay,
      playbackTick: this.playbackTick,
      totalTimelineTicks: this.totalTimelineTicks(),
      totalAudioTicks: this.totalAudioTicks(),
      isMetronomeEnabled: this.metronomeEnabled,
      isClapEnabled: this.clapEnabled,
      play: this.play,
      pause: this.pause,
      togglePlay: this.togglePlay,
      seekStart: this.seekStart,
      seekEnd: this.seekEnd,
      setPlaybackTick: this.setPlaybackTick,
      refresh: this.refresh,
      toggleMetronome: this.toggleMetronome,
      toggleClap: this.toggleClap,
      setActiveView: this.setActiveView,
      previewTrack: this.previewTrack,
      previewNotes: this.previewNotes,
      stopPreview: this.stopPreview,
    };
  }

  private publish(): void {
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
  }
}
