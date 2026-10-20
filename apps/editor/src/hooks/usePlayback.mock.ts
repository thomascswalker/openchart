import { fn } from "storybook/test";
import { useSyncExternalStore } from "react";
import type { PlaybackSnapshot } from "../services/playback";

export * from "./usePlayback";

const TICKS_PER_SECOND = 960; // 120 BPM at 480 PPQN
const FRAME_MS = 1000 / 60;

type MockState = Pick<
  PlaybackSnapshot,
  | "isPlaying"
  | "playbackTick"
  | "totalTimelineTicks"
  | "isMetronomeEnabled"
  | "isClapEnabled"
  | "isVocalPitchFeedbackEnabled"
>;

const initialState: MockState = {
  isPlaying: false,
  playbackTick: 0,
  totalTimelineTicks: 0,
  isMetronomeEnabled: false,
  isClapEnabled: false,
  isVocalPitchFeedbackEnabled: false,
};

/**
 * In-memory stand-in for PlaybackService. It owns the same state and exposes
 * the same commands, so the Timeline controls and scrubbing behave as in the
 * app without audio or a document.
 */
function createMockPlaybackService() {
  let state: MockState = { ...initialState };
  let snapshot: PlaybackSnapshot;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastMs = 0;
  const listeners = new Set<() => void>();

  const commit = (patch: Partial<MockState>) => {
    state = { ...state, ...patch };
    snapshot = buildSnapshot();
    listeners.forEach((listener) => listener());
  };

  const stopTimer = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const advance = () => {
    const now = performance.now();
    const next =
      state.playbackTick + ((now - lastMs) / 1000) * TICKS_PER_SECOND;
    lastMs = now;
    if (next >= state.totalTimelineTicks) {
      stopTimer();
      commit({ isPlaying: false, playbackTick: state.totalTimelineTicks });
    } else {
      commit({ playbackTick: next });
    }
  };

  const api = {
    play: fn(() => {
      if (state.isPlaying) return;
      if (state.playbackTick >= state.totalTimelineTicks) {
        state = { ...state, playbackTick: 0 };
      }
      lastMs = performance.now();
      timer = setInterval(advance, FRAME_MS);
      commit({ isPlaying: true });
    }),
    pause: fn(() => {
      stopTimer();
      commit({ isPlaying: false });
    }),
    togglePlay: fn(() => (state.isPlaying ? api.pause() : api.play())),
    seekStart: fn(() => commit({ playbackTick: 0 })),
    seekEnd: fn(() => commit({ playbackTick: state.totalTimelineTicks })),
    setPlaybackTick: fn((value: number) =>
      commit({ playbackTick: Math.max(0, value) }),
    ),
    toggleMetronome: fn(() =>
      commit({ isMetronomeEnabled: !state.isMetronomeEnabled }),
    ),
    toggleClap: fn(() => commit({ isClapEnabled: !state.isClapEnabled })),
    toggleVocalPitchFeedback: fn(() =>
      commit({
        isVocalPitchFeedbackEnabled: !state.isVocalPitchFeedbackEnabled,
      }),
    ),
    refresh: fn(() => {}),
    setActiveView: fn((_viewId: string) => {}),
    previewTrack: fn(() => {}),
    previewNotes: fn(() => {}),
    stopPreview: fn(() => {}),
  };

  function buildSnapshot(): PlaybackSnapshot {
    return { ...state, ...api } as unknown as PlaybackSnapshot;
  }
  snapshot = buildSnapshot();

  const actions: Record<string, (...args: unknown[]) => void> = {
    "playback.play": () => api.play(),
    "playback.pause": () => api.pause(),
    "playback.toggle": () => api.togglePlay(),
    "playback.seek-start": () => api.seekStart(),
    "playback.seek-end": () => api.seekEnd(),
    "playback.set-tick": (tick) => api.setPlaybackTick(tick as number),
    "playback.toggle-metronome": () => api.toggleMetronome(),
    "playback.toggle-clap": () => api.toggleClap(),
    "playback.toggle-vocal-pitch-feedback": () =>
      api.toggleVocalPitchFeedback(),
  };

  return {
    ...api,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    /** Stop playback and reset state, e.g. from a story's `beforeEach`. */
    configure: (patch: Partial<MockState> = {}) => {
      stopTimer();
      commit({ ...initialState, ...patch });
    },
    /** Route an action id (e.g. "playback.toggle") to the mock; false if unknown. */
    runAction: (id: string, ...args: unknown[]): boolean => {
      const handler = actions[id];
      handler?.(...args);
      return handler !== undefined;
    },
  };
}

export const MockPlaybackService = createMockPlaybackService();

export function usePlayback(): PlaybackSnapshot {
  return useSyncExternalStore(
    MockPlaybackService.subscribe,
    MockPlaybackService.getSnapshot,
    MockPlaybackService.getSnapshot,
  );
}

export function usePlaybackSelector<T>(
  select: (snapshot: PlaybackSnapshot) => T,
): T {
  const read = () => select(MockPlaybackService.getSnapshot());
  return useSyncExternalStore(MockPlaybackService.subscribe, read, read);
}
