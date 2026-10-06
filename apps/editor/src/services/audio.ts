import type { ApplicationSettings } from "./settings";
import { IStatefulService } from "../platform/services";

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

export interface AudioPlayer {
  duration: number;
  currentTime: number;
  volume?: number;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  destroy: () => void;
}

interface EventfulAudioPlayer {
  on: (event: string, callback: () => void) => void;
  off?: (event: string, callback: () => void) => void;
}

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

export type AudioServiceSnapshot = Omit<
  AudioPlayback,
  | "setAudio"
  | "setFileName"
  | "setAudioSource"
  | "clearAudioSource"
  | "setSourceEnabled"
  | "setSourceVolume"
  | "play"
  | "pause"
  | "seek"
> & {
  audioDirectoryHandle: FileSystemDirectoryHandle | null;
  audioDirectoryName: string | null;
  audioDirectorySupported: boolean;
};

const wavFilePickerTypes: FilePickerAcceptType[] = [
  { description: "WAV file", accept: { "audio/wav": [".wav"] } },
];

export class AudioService extends IStatefulService<AudioServiceSnapshot> {
  private players = new Map<AudioRole, AudioPlayer>();
  private sources = new Map<AudioRole, AudioSourceState>();
  private playerCleanups = new Map<AudioRole, () => void>();
  private listeners = new Set<() => void>();
  private fileName: string | null = null;
  private fileInputRef: { current: HTMLInputElement | null } | null = null;
  private audioDirectoryHandle: FileSystemDirectoryHandle | null = null;
  private audioDirectorySupported =
    typeof window !== "undefined" &&
    typeof window.showDirectoryPicker === "function";
  private audioLoadRequests = new Map<AudioRole, number>();
  private endCount = 0;
  private snapshot: AudioServiceSnapshot = this.createSnapshot();

  public readonly reset = (): void => {
    for (const role of this.audioLoadRequests.keys()) {
      this.audioLoadRequests.set(role, this.audioLoadRequests.get(role)! + 1);
    }
    const roles = new Set<AudioRole>([
      ...this.players.keys(),
      ...this.sources.keys(),
    ]);
    for (const role of roles) {
      this.replacePlayer(role, undefined);
      this.replaceSource(role, undefined);
    }
    this.fileName = null;
    this.audioDirectoryHandle = null;
    this.endCount = 0;
    this.publish();
  };

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public readonly getSnapshot = (): AudioServiceSnapshot => this.snapshot;

  public readonly initialize = async (): Promise<void> => {
    const { loadAudioDirectoryHandle } =
      await import("../util/audioDirectoryHandle");
    this.setAudioDirectoryHandle(await loadAudioDirectoryHandle());
  };

  public readonly setFileInputRef = (fileInputRef: {
    current: HTMLInputElement | null;
  }): void => {
    this.fileInputRef = fileInputRef;
  };

  public readonly setAudioDirectoryHandle = (
    handle: FileSystemDirectoryHandle | null,
  ): void => {
    if (this.audioDirectoryHandle === handle) return;
    this.audioDirectoryHandle = handle;
    this.publish();
  };

  public readonly openAudio = async (): Promise<void> => {
    if (typeof window.showOpenFilePicker !== "function") {
      this.fileInputRef?.current?.click();
      return;
    }
    const [handle] = await window.showOpenFilePicker({
      types: wavFilePickerTypes,
    });
    if (handle) await this.loadAudioFile(await handle.getFile());
  };

  public readonly loadAudioFile = async (file: File): Promise<void> => {
    await this.loadAudioSource("single", file);
  };

  public readonly loadAudioSource = async (
    role: AudioRole,
    file: File,
  ): Promise<void> => {
    if (!file.name.toLowerCase().endsWith(".wav")) {
      throw new Error("Choose a WAV audio file (.wav).");
    }
    const requestId = (this.audioLoadRequests.get(role) ?? 0) + 1;
    this.audioLoadRequests.set(role, requestId);
    await file.arrayBuffer();
    if (requestId !== this.audioLoadRequests.get(role)) return;

    const url = URL.createObjectURL(file);
    try {
      const { Audio } = await import("ts-audio");
      if (requestId !== this.audioLoadRequests.get(role)) {
        URL.revokeObjectURL(url);
        return;
      }
      const player = Audio({ file: url, preload: true }) as AudioPlayer;
      this.setAudioSource(
        { role, fileName: file.name, url, enabled: true, volume: 1 },
        player,
      );
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  };

  public readonly discoverAudio = async (
    settings: ApplicationSettings,
    reportMissing = false,
  ): Promise<string | null> => {
    try {
      const { isTauri } = await import("@tauri-apps/api/core");
      const {
        discoverMultitrackAudio,
        discoverMultitrackAudioFromHandle,
        discoverSongAudio,
        discoverSongAudioFromHandle,
      } = await import("../util/audioDiscovery");
      const { hasReadPermission } =
        await import("../util/audioDirectoryHandle");

      if (settings.audio.multitrack) {
        const regexes = {
          lead: settings.discovery.leadRegex,
          rhythm: settings.discovery.rhythmRegex,
          bass: settings.discovery.bassRegex,
          drums: settings.discovery.drumsRegex,
          vocals: settings.discovery.vocalsRegex,
          harmonies: settings.discovery.harmoniesRegex,
          synth: settings.discovery.synthRegex,
          other: settings.discovery.otherRegex,
        } as const;
        const discovered = isTauri()
          ? await discoverMultitrackAudio(settings.audio.rootPath, regexes)
          : this.audioDirectoryHandle &&
              (await hasReadPermission(this.audioDirectoryHandle))
            ? await discoverMultitrackAudioFromHandle(
                this.audioDirectoryHandle,
                regexes,
              )
            : null;
        if (!discovered) return null;

        for (const [role, source] of Object.entries(discovered.matches)) {
          if (source) {
            this.setAudioSource({
              role: role as AudioRole,
              fileName: source.name,
              url: source.url,
              enabled: true,
              volume: 1,
            });
          }
        }
        const ambiguous = Object.entries(discovered.ambiguous).filter(
          ([, names]) => names?.length,
        );
        if (reportMissing && (discovered.missing.length || ambiguous.length)) {
          return `Audio roles unresolved: ${[
            ...discovered.missing,
            ...ambiguous.map(([role]) => role),
          ].join(", ")}`;
        }
        return null;
      }

      const discovered = isTauri()
        ? await discoverSongAudio(
            settings.audio.rootPath,
            settings.discovery.songRegex,
          )
        : this.audioDirectoryHandle &&
            (await hasReadPermission(this.audioDirectoryHandle))
          ? await discoverSongAudioFromHandle(
              this.audioDirectoryHandle,
              settings.discovery.songRegex,
            )
          : null;
      if (discovered) {
        this.setAudioSource({
          role: "single",
          fileName: discovered.name,
          url: discovered.url,
          enabled: true,
          volume: 1,
        });
      } else if (reportMissing) {
        return "No matching audio file was found at the audio path.";
      }
      return null;
    } catch (error) {
      if (!reportMissing) {
        console.warn("Automatic audio discovery failed:", error);
        return null;
      }
      return error instanceof Error && error.message
        ? error.message
        : "Failed to scan the audio path.";
    }
  };

  public readonly selectAudioFolder = async (
    settings: ApplicationSettings,
  ): Promise<void> => {
    if (typeof window.showDirectoryPicker !== "function") {
      throw new Error("Directory picking is not supported.");
    }
    const handle = await window.showDirectoryPicker({ mode: "read" });
    const { requestReadPermission, saveAudioDirectoryHandle } =
      await import("../util/audioDirectoryHandle");
    if (!(await requestReadPermission(handle))) {
      throw new Error("Permission to read the selected folder was denied.");
    }
    await saveAudioDirectoryHandle(handle);
    this.setAudioDirectoryHandle(handle);
    const error = await this.discoverAudio(settings, true);
    if (error) throw new Error(error);
  };

  public readonly listDiscoveredFiles = async (
    rootPath: string,
  ): Promise<string[] | null> => {
    try {
      const { isTauri } = await import("@tauri-apps/api/core");
      const { listAudioFileNames, listAudioFileNamesFromHandle } =
        await import("../util/audioDiscovery");
      const { hasReadPermission } =
        await import("../util/audioDirectoryHandle");
      if (isTauri()) return await listAudioFileNames(rootPath);
      if (
        this.audioDirectoryHandle &&
        (await hasReadPermission(this.audioDirectoryHandle))
      ) {
        return await listAudioFileNamesFromHandle(this.audioDirectoryHandle);
      }
      return null;
    } catch (error) {
      console.warn("Could not list audio files:", error);
      return null;
    }
  };

  public readonly setAudio = (audio: AudioPlayer | undefined): void => {
    this.replacePlayer("single", audio);
    this.replaceSource(
      "single",
      audio
        ? {
            role: "single",
            fileName: null,
            url: null,
            enabled: true,
            volume: 1,
          }
        : undefined,
    );
  };

  public readonly setFileName = (name: string | null): void => {
    if (this.fileName === name) return;
    this.fileName = name;
    this.publish();
  };

  public readonly setAudioSource = (
    source: AudioSourceState,
    player?: AudioPlayer,
  ): void => {
    if (player) {
      this.replacePlayer(source.role, player);
    } else if (
      source.url &&
      this.sources.get(source.role)?.url !== source.url
    ) {
      void this.createPlayer(source.role, source.url);
    }
    this.replaceSource(source.role, source);
    if (source.role === "single") this.fileName = source.fileName;
    this.applyVolume(source.role);
    this.publish();
  };

  public readonly clearAudioSource = (role: AudioRole): void => {
    this.replacePlayer(role, undefined);
    this.replaceSource(role, undefined);
    if (role === "single") this.fileName = null;
    this.publish();
  };

  public readonly setSourceEnabled = (
    role: AudioRole,
    enabled: boolean,
  ): void => {
    const source = this.sources.get(role);
    if (!source || source.enabled === enabled) return;
    this.replaceSource(role, { ...source, enabled });
    this.applyVolume(role);
    this.publish();
  };

  public readonly setSourceVolume = (role: AudioRole, volume: number): void => {
    const source = this.sources.get(role);
    if (!source) return;
    const nextVolume = Math.max(0, Math.min(1, volume));
    if (source.volume === nextVolume) return;
    this.replaceSource(role, { ...source, volume: nextVolume });
    this.applyVolume(role);
    this.publish();
  };

  public readonly play = (): void => {
    for (const [role, player] of this.players) {
      if (this.sources.get(role)?.enabled ?? true) player.play();
    }
  };

  public readonly pause = (): void => {
    for (const player of this.players.values()) player.pause();
  };

  public readonly seek = (seconds: number): void => {
    for (const player of this.players.values()) player.seek(seconds);
  };

  public dispose(): void {
    for (const cleanup of this.playerCleanups.values()) cleanup();
    this.playerCleanups.clear();
    for (const player of this.players.values()) player.destroy();
    this.players = new Map();
    for (const source of this.sources.values()) this.revokeSourceUrl(source);
    this.sources = new Map();
    this.fileName = null;
    this.endCount = 0;
    this.publish();
    this.listeners.clear();
  }

  private async createPlayer(role: AudioRole, url: string): Promise<void> {
    const { Audio } = await import("ts-audio");
    if (this.sources.get(role)?.url !== url) return;
    this.replacePlayer(
      role,
      Audio({ file: url, preload: true }) as AudioPlayer,
    );
    this.publish();
  }

  private replacePlayer(role: AudioRole, next: AudioPlayer | undefined): void {
    const previous = this.players.get(role);
    if (previous === next) return;
    this.playerCleanups.get(role)?.();
    this.playerCleanups.delete(role);
    previous?.destroy();

    if (next) {
      this.players.set(role, next);
      const onEnd = () => {
        this.endCount += 1;
        this.publish();
      };
      const onReady = () => {
        this.publish();
      };
      const eventful = next as unknown as EventfulAudioPlayer;
      eventful.on("end", onEnd);
      eventful.on("ready", onReady);
      this.playerCleanups.set(role, () => {
        eventful.off?.("end", onEnd);
        eventful.off?.("ready", onReady);
      });
      this.applyVolume(role);
    } else {
      this.players.delete(role);
    }
  }

  private replaceSource(
    role: AudioRole,
    next: AudioSourceState | undefined,
  ): void {
    const previous = this.sources.get(role);
    if (previous?.url !== next?.url) this.revokeSourceUrl(previous);
    if (next) this.sources.set(role, next);
    else this.sources.delete(role);
  }

  private revokeSourceUrl(source: AudioSourceState | undefined): void {
    if (source?.url?.startsWith("blob:")) URL.revokeObjectURL(source.url);
  }

  private applyVolume(role: AudioRole): void {
    const source = this.sources.get(role);
    const player = this.players.get(role);
    if (source && player && player.volume !== undefined) {
      player.volume = source.enabled ? source.volume : 0;
    }
  }

  private createSnapshot(): AudioServiceSnapshot {
    return {
      audio: this.players.get("single") ?? this.players.values().next().value,
      players: this.players,
      sources: this.sources,
      duration: Math.max(
        0,
        ...Array.from(this.players.values()).map(
          (player) => player.duration * 1_000,
        ),
      ),
      fileName: this.fileName,
      endCount: this.endCount,
      audioDirectoryHandle: this.audioDirectoryHandle,
      audioDirectoryName: this.audioDirectoryHandle?.name ?? null,
      audioDirectorySupported: this.audioDirectorySupported,
    };
  }

  private publish(): void {
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
  }
}
