import {
  msToTicks,
  ticksToMs,
  type Midi,
  type MidiNote,
  type TempoEvent,
} from "@openchart/core";
import { Difficulty, SongView, VocalTrackView } from "@openchart/views";
import {
  Soundboard,
  type SoundboardSettings,
  type PitchRange,
  type PreviewNote,
} from "../audio/soundboard";
import type { DocumentService } from "./document";
import type { MixerService } from "./mixer";
import type { ApplicationSettings } from "./settings/schema";
import { StatefulService } from "../platform/services";

export interface PlaybackSnapshot {
  isPlaying: boolean;
  playbackTick: number;
  totalTimelineTicks: number;
  isMetronomeEnabled: boolean;
  isClapEnabled: boolean;
  /** Pitched vocal notes sound at their MIDI pitch during playback. */
  isVocalPitchFeedbackEnabled: boolean;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekStart: () => void;
  seekEnd: () => void;
  setPlaybackTick: (tick: number) => void;
  refresh: () => void;
  toggleMetronome: () => void;
  toggleClap: () => void;
  toggleVocalPitchFeedback: () => void;
  setActiveView: (viewId: string) => void;
  /** Preview the current track; an explicit range overrides the settings range. */
  previewTrack: (trackIndex?: number, range?: PitchRange) => void;
  /** Preview an explicit piano-roll selection; an explicit range filters that selection. */
  previewNotes: (notes: readonly PreviewNote[], range?: PitchRange) => void;
  stopPreview: () => void;
}

export interface PlaybackConfiguration {
  midiData: Midi | null | undefined;
  documentId?: number;
  settings: ApplicationSettings;
  snapEnabled: boolean;
  snapDenominator: number;
  selectedInstrument: string;
  selectedDifficulty: Difficulty;
  selectedTrackIndex: number | null;
}

const DEFAULT_TEMPO: TempoEvent[] = [
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

/**
 * Pitched notes for vocal pitch feedback: the selected instrument when it is
 * a vocal track, otherwise the first configured vocal track, so the toggle
 * lets you hear the melody while editing any part.
 */
export function notesForVocalFeedback(
  midi: Midi | null | undefined,
  instrument: string,
): readonly MidiNote[] {
  if (!midi) return [];
  const song = new SongView(midi);
  const selected = song.getInstrumentTrackView(instrument);
  const view =
    selected instanceof VocalTrackView
      ? selected
      : song
          .getInstrumentTrackViews?.()
          .find(
            (item): item is VocalTrackView => item instanceof VocalTrackView,
          );
  return view?.getNotes("pitched").map((item) => item.note) ?? [];
}

export class PlaybackService extends StatefulService<PlaybackSnapshot> {
  static dependencies = ["document", "mixer"];

  private engine = new Soundboard();
  private documentUnsubscribe: (() => void) | undefined;
  private midiData: Midi | null | undefined;
  private documentId: number | undefined;
  private settings: ApplicationSettings | null = null;
  private selectedInstrument = "LEAD GUITAR";
  private selectedDifficulty: Difficulty = Difficulty.Expert;
  private selectedTrackIndex: number | null = null;
  private metronomeEnabled = false;
  private defaultMetronome: boolean | null = null;
  private clapEnabled = false;
  private highwayActive = false;
  private highwayNotes: readonly MidiNote[] = [];
  private vocalFeedbackEnabled = false;
  private vocalNotes: readonly MidiNote[] = [];
  private feedbackSettings: SoundboardSettings | null = null;
  private feedbackSettingsSource: ApplicationSettings["feedback"] | null = null;
  private snapEnabled = true;
  private snapDenominator = 4;
  private isPlaying = false;
  private playbackTick = 0;
  private midiTotalTicks = 0;
  private midiPlaybackEndTick = 0;
  private ppqn = 480;
  private tempoEvents: TempoEvent[] = DEFAULT_TEMPO;
  private animationFrame: number | null = null;
  private lastFrameMs: number | null = null;
  private configured = false;
  private readonly mixerService?: MixerService;

  constructor(documentService?: DocumentService, mixerService?: MixerService) {
    super();
    this.mixerService = mixerService;
    // Edits publish synchronously, so the end never lags behind the document.
    this.documentUnsubscribe = documentService?.subscribe(() => {
      if (this.configured) {
        this.refresh(documentService.data);
      }
    });
    this._snapshot = this.buildSnapshot();
  }

  public readonly reset = (): void => {
    this.stopPlayback(true);
    this.engine.stopPreview();
    this.midiData = null;
    this.selectedInstrument = "LEAD GUITAR";
    this.selectedDifficulty = Difficulty.Expert;
    this.selectedTrackIndex = null;
    this.highwayNotes = [];
    this.vocalNotes = [];
    this.midiTotalTicks = 0;
    this.midiPlaybackEndTick = 0;
    this.ppqn = 480;
    this.tempoEvents = DEFAULT_TEMPO;
    this.resetSession();
    this.publish();
  };

  public readonly configure = (options: PlaybackConfiguration): void => {
    const documentChanged =
      options.documentId === undefined
        ? this.midiData !== options.midiData
        : this.documentId !== options.documentId;
    const selectionChanged =
      documentChanged ||
      this.selectedInstrument !== options.selectedInstrument ||
      this.selectedDifficulty !== options.selectedDifficulty;

    this.midiData = options.midiData;
    this.documentId = options.documentId;
    this.settings = options.settings;
    this.snapEnabled = options.snapEnabled;
    this.snapDenominator = options.snapDenominator;
    this.selectedInstrument = options.selectedInstrument;
    this.selectedDifficulty = options.selectedDifficulty;
    this.selectedTrackIndex = options.selectedTrackIndex;
    this.ppqn = this.midiData?.header.division ?? 480;
    this.tempoEvents = this.midiData?.getTempoEvents() ?? DEFAULT_TEMPO;
    if (selectionChanged || !this.configured) {
      this.highwayNotes = notesForHighway(
        this.midiData,
        this.selectedInstrument,
        this.selectedDifficulty,
      );
      this.updateVocalNotes();
    }
    const defaultMetronome = options.settings.feedback.metronomeEnabled;
    if (this.defaultMetronome !== defaultMetronome) {
      this.defaultMetronome = defaultMetronome;
      this.metronomeEnabled = defaultMetronome;
    }
    this.configureEngine();

    if (this.configured && documentChanged) {
      this.stopPlayback(true);
      this.playbackTick = 0;
      this.syncMixerPosition();
    }
    this.configured = true;
    this.refresh();
  };

  public readonly refresh = (midiData?: Midi | null): void => {
    if (midiData !== undefined) {
      this.midiData = midiData;
      this.ppqn = midiData?.header.division ?? 480;
      this.tempoEvents = midiData?.getTempoEvents() ?? DEFAULT_TEMPO;
      this.highwayNotes = notesForHighway(
        midiData,
        this.selectedInstrument,
        this.selectedDifficulty,
      );
      this.updateVocalNotes();
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
      const timeSignatures = this.midiData?.getTimeSignatureEvents() ?? [];
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
    if (!this.isPlaying) {
      this.syncMixerPosition();
    }
    this.publish();
  };

  public readonly setPlaybackTick = (tick: number): void => {
    const nextTick = Math.max(0, tick);
    if (nextTick === this.playbackTick) return;
    this.playbackTick = nextTick;
    this.engine.seek(this.playbackTick);
    this.syncMixerPosition();
    this.publish();
  };

  public readonly play = (): void => {
    const totalTicks = this.totalTimelineTicks();
    if (totalTicks > 0 && this.playbackTick >= totalTicks) {
      this.setPlaybackTick(0);
    }
    this.syncMixerPosition();
    this.mixerService?.play();
    this.isPlaying = true;
    this.engine.start(this.playbackTick);
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
    this.syncMixerPosition();
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

  public readonly toggleVocalPitchFeedback = (): void => {
    this.vocalFeedbackEnabled = !this.vocalFeedbackEnabled;
    // Start audio inside the originating gesture, like metronome and clap.
    if (this.vocalFeedbackEnabled) void this.engine.ensureStarted();
    this.updateVocalNotes();
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
    this.stopPlayback(true);
    this.engine.dispose();
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
    this.vocalFeedbackEnabled = false;
    this.highwayActive = false;
    this.playbackTick = 0;
    this.feedbackSettings = null;
    this._snapshot = this.buildSnapshot();
  }

  private configureEngine(): void {
    if (!this.settings) return;
    this.engine.configure({
      midi: this.midiData,
      ppqn: this.ppqn,
      tempoEvents: this.tempoEvents,
      timeSignatureEvents: this.midiData?.getTimeSignatureEvents() ?? [
        { tick: 0, numerator: 4, denominator: 2 },
      ],
      settings: this.getFeedbackSettings(this.settings),
      clapEnabled: this.clapEnabled,
      highwayActive: this.highwayActive,
      highwayNotes: this.highwayNotes,
      // A selected track change also resets the tracker so a newly active
      // viewport cannot replay stale crossings.
      highwayKey: `${this.selectedTrackIndex ?? -1}:${this.selectedInstrument}:${this.selectedDifficulty}`,
      vocalFeedbackEnabled: this.vocalFeedbackEnabled,
      vocalNotes: this.vocalNotes,
    });
  }

  // Only collected while the toggle is on, so playback without vocal
  // feedback never walks the vocal track. The array identity changes only
  // with the document or selection, which the engine uses to reset.
  private updateVocalNotes(): void {
    this.vocalNotes = this.vocalFeedbackEnabled
      ? notesForVocalFeedback(this.midiData, this.selectedInstrument)
      : [];
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

  private stopPlayback(stopMixer = false): void {
    this.isPlaying = false;
    this.engine.stop();
    if (stopMixer) this.mixerService?.stop();
    else this.mixerService?.pause();
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
    const totalTicks = this.totalTimelineTicks();
    // While audio is playing, the audio clock is the single source of truth
    // for the playhead: the tick is derived from it, and the mixer is never
    // re-seeked from here (restarting a stem every frame is what made playback
    // crunchy). With no audio, or once the stems have ended, the MIDI-only
    // clock keeps advancing from the last tick using the frame time.
    const audioSeconds = this.mixerService?.clockTime ?? null;
    if (audioSeconds !== null) {
      const nextTick = msToTicks(
        audioSeconds * 1000,
        this.ppqn,
        this.tempoEvents,
      );
      this.playbackTick =
        totalTicks > 0 && nextTick >= totalTicks ? totalTicks : nextTick;
    } else if (this.lastFrameMs !== null) {
      const elapsedMs = frameTimeMs - this.lastFrameMs;
      const currentMs =
        ticksToMs(this.playbackTick, this.ppqn, this.tempoEvents) + elapsedMs;
      const nextTick = msToTicks(currentMs, this.ppqn, this.tempoEvents);
      this.playbackTick =
        totalTicks > 0 && nextTick >= totalTicks ? totalTicks : nextTick;
    }
    this.lastFrameMs = frameTimeMs;

    this.engine.updateTick(this.playbackTick);
    this.publish();
    if (totalTicks > 0 && this.playbackTick >= totalTicks) {
      this.stopPlayback(true);
      return;
    }
    this.requestNextFrame();
  };

  /**
   * Positions the mixer at the playhead. Only for discontinuities (seek, play
   * start, pause snap): during playback the audio drives the playhead instead.
   */
  private syncMixerPosition(): void {
    const timeSeconds =
      ticksToMs(this.playbackTick, this.ppqn, this.tempoEvents) / 1000;
    this.mixerService?.seek(timeSeconds);
  }

  private totalTimelineTicks(): number {
    return this.midiPlaybackEndTick;
  }

  private buildSnapshot(): PlaybackSnapshot {
    return {
      isPlaying: this.isPlaying,
      playbackTick: this.playbackTick,
      totalTimelineTicks: this.totalTimelineTicks(),
      isMetronomeEnabled: this.metronomeEnabled,
      isClapEnabled: this.clapEnabled,
      isVocalPitchFeedbackEnabled: this.vocalFeedbackEnabled,
      play: this.play,
      pause: this.pause,
      togglePlay: this.togglePlay,
      seekStart: this.seekStart,
      seekEnd: this.seekEnd,
      setPlaybackTick: this.setPlaybackTick,
      refresh: this.refresh,
      toggleMetronome: this.toggleMetronome,
      toggleClap: this.toggleClap,
      toggleVocalPitchFeedback: this.toggleVocalPitchFeedback,
      setActiveView: this.setActiveView,
      previewTrack: this.previewTrack,
      previewNotes: this.previewNotes,
      stopPreview: this.stopPreview,
    };
  }

  private publish(): void {
    this._snapshot = this.buildSnapshot();
    this.notify();
  }
}
