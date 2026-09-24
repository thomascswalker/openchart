import { Audio } from "ts-audio";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type AudioRole =
  | "single"
  | "lead"
  | "rhythm"
  | "bass"
  | "drums"
  | "vocals"
  | "harmonies"
  | "synth"
  | "other";
export const AUDIO_ROLES: readonly AudioRole[] = [
  "lead",
  "rhythm",
  "bass",
  "drums",
  "vocals",
  "harmonies",
  "synth",
  "other",
];

export interface AudioSourceState {
  role: AudioRole;
  fileName: string | null;
  url: string | null;
  enabled: boolean;
  volume: number;
}

type AudioPlayer = ReturnType<typeof Audio>;

export interface AudioPlayback {
  audio: AudioPlayer | undefined;
  players: ReadonlyMap<AudioRole, AudioPlayer>;
  sources: ReadonlyMap<AudioRole, AudioSourceState>;
  duration: number;
  fileName: string | null;
  endCount: number;
  setAudio: (audio: AudioPlayer | undefined) => void;
  setFileName: (name: string | null) => void;
  setAudioSource: (source: AudioSourceState, player?: AudioPlayer) => void;
  clearAudioSource: (role: AudioRole) => void;
  setSourceEnabled: (role: AudioRole, enabled: boolean) => void;
  setSourceVolume: (role: AudioRole, volume: number) => void;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
}

export function useAudioPlayer(): AudioPlayback {
  const [players, setPlayers] = useState<Map<AudioRole, AudioPlayer>>(
    new Map(),
  );
  const [sources, setSources] = useState<Map<AudioRole, AudioSourceState>>(
    new Map(),
  );
  const playersRef = useRef(players);
  playersRef.current = players;
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const [fileName, setFileName] = useState<string | null>(null);
  const [endCount, setEndCount] = useState(0);
  const [durationVersion, setDurationVersion] = useState(0);

  const replacePlayer = useCallback(
    (role: AudioRole, next: AudioPlayer | undefined) => {
      setPlayers((current) => {
        const previous = current.get(role);
        if (previous && previous !== next) previous.destroy();
        const result = new Map(current);
        if (next) result.set(role, next);
        else result.delete(role);
        return result;
      });
    },
    [],
  );

  const setAudio = useCallback(
    (audio: AudioPlayer | undefined) => {
      replacePlayer("single", audio);
      setSources((current) => {
        const previous = current.get("single");
        if (previous?.url?.startsWith("blob:"))
          URL.revokeObjectURL(previous.url);
        const result = new Map(current);
        if (audio)
          result.set("single", {
            role: "single",
            fileName: null,
            url: null,
            enabled: true,
            volume: 1,
          });
        else result.delete("single");
        return result;
      });
    },
    [replacePlayer],
  );

  const setAudioSource = useCallback(
    (source: AudioSourceState, player?: AudioPlayer) => {
      if (player) replacePlayer(source.role, player);
      else if (source.url)
        replacePlayer(source.role, Audio({ file: source.url, preload: true }));
      setSources((current) => {
        const previous = current.get(source.role);
        if (
          previous?.url &&
          previous.url !== source.url &&
          previous.url.startsWith("blob:")
        ) {
          URL.revokeObjectURL(previous.url);
        }
        return new Map(current).set(source.role, source);
      });
      if (source.role === "single") setFileName(source.fileName);
    },
    [replacePlayer],
  );

  const clearAudioSource = useCallback(
    (role: AudioRole) => {
      replacePlayer(role, undefined);
      setSources((current) => {
        const previous = current.get(role);
        if (previous?.url?.startsWith("blob:"))
          URL.revokeObjectURL(previous.url);
        const result = new Map(current);
        result.delete(role);
        return result;
      });
      if (role === "single") setFileName(null);
    },
    [replacePlayer],
  );

  const setSourceEnabled = useCallback((role: AudioRole, enabled: boolean) => {
    setSources((current) => {
      const source = current.get(role);
      return source
        ? new Map(current).set(role, { ...source, enabled })
        : current;
    });
  }, []);

  const setSourceVolume = useCallback((role: AudioRole, volume: number) => {
    const nextVolume = Math.max(0, Math.min(1, volume));
    setSources((current) => {
      const source = current.get(role);
      return source
        ? new Map(current).set(role, { ...source, volume: nextVolume })
        : current;
    });
  }, []);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    for (const [role, player] of players) {
      const source = sources.get(role);
      const audio = player as unknown as { volume?: number };
      if (audio.volume !== undefined && source)
        audio.volume = source.enabled ? source.volume : 0;
      const onEnd = () => setEndCount((count) => count + 1);
      const onReady = () => setDurationVersion((version) => version + 1);
      const eventful = player as unknown as {
        on: (name: string, callback: () => void) => void;
        off?: (name: string, callback: () => void) => void;
      };
      eventful.on("end", onEnd);
      eventful.on("ready", onReady);
      cleanups.push(() => {
        eventful.off?.("end", onEnd);
        eventful.off?.("ready", onReady);
      });
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [players, sources]);

  useEffect(
    () => () => {
      for (const player of playersRef.current.values()) player.destroy();
      for (const source of sourcesRef.current.values()) {
        if (source.url?.startsWith("blob:")) URL.revokeObjectURL(source.url);
      }
    },
    [],
  );

  const duration = useMemo(
    () =>
      Math.max(
        0,
        ...Array.from(players.values()).map(
          (player) => player.duration * 1_000,
        ),
      ),
    [durationVersion, players],
  );
  const audio = players.get("single") ?? players.values().next().value;
  const activePlayers = () =>
    Array.from(players.entries())
      .filter(([role]) => sources.get(role)?.enabled ?? true)
      .map(([, player]) => player);

  return {
    audio,
    players,
    sources,
    duration,
    fileName,
    endCount,
    setAudio,
    setFileName,
    setAudioSource,
    clearAudioSource,
    setSourceEnabled,
    setSourceVolume,
    play: () => activePlayers().forEach((player) => player.play()),
    pause: () =>
      Array.from(players.values()).forEach((player) => player.pause()),
    seek: (seconds) =>
      Array.from(players.values()).forEach((player) => player.seek(seconds)),
  };
}
