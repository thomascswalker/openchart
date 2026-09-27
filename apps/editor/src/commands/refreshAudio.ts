import { isTauri } from "@tauri-apps/api/core";
import { Audio } from "ts-audio";
import {
  discoverMultitrackAudio,
  discoverMultitrackAudioFromHandle,
  discoverSongAudio,
  discoverSongAudioFromHandle,
} from "../util/audioDiscovery";
import { hasReadPermission } from "../util/audioDirectoryHandle";
import type { AudioCommandContext, EditorCommandCallback } from "./command";

export async function discoverAudio(
  context: AudioCommandContext,
  options?: { reportMissing?: boolean },
): Promise<void> {
  const { settings, audioDirectoryHandle } = context;
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
      : audioDirectoryHandle && (await hasReadPermission(audioDirectoryHandle))
        ? await discoverMultitrackAudioFromHandle(audioDirectoryHandle, regexes)
        : null;
    if (discovered) {
      for (const [role, source] of Object.entries(discovered.matches)) {
        if (source)
          context.setAudioSource({
            role: role as keyof typeof regexes,
            fileName: source.name,
            url: source.url,
            enabled: true,
            volume: 1,
          });
      }
      const ambiguous = Object.entries(discovered.ambiguous).filter(
        ([, names]) => names?.length,
      );
      if (
        options?.reportMissing &&
        (discovered.missing.length || ambiguous.length)
      ) {
        context.setError(
          `Audio roles unresolved: ${[...discovered.missing, ...ambiguous.map(([role]) => role)].join(", ")}`,
        );
      }
    }
    return;
  }

  try {
    const discovered = isTauri()
      ? await discoverSongAudio(
          settings.audio.rootPath,
          settings.discovery.songRegex,
        )
      : audioDirectoryHandle && (await hasReadPermission(audioDirectoryHandle))
        ? await discoverSongAudioFromHandle(
            audioDirectoryHandle,
            settings.discovery.songRegex,
          )
        : null;

    if (discovered) {
      const player = Audio({ file: discovered.url, preload: true });
      context.setAudio(player);
      context.setAudioSource(
        {
          role: "single",
          fileName: discovered.name,
          url: discovered.url,
          enabled: true,
          volume: 1,
        },
        player,
      );
      context.setAudioFileName(discovered.name);
      context.setError(null);
    } else if (options?.reportMissing) {
      context.setError("No matching audio file was found at the audio path.");
    }
  } catch (discoverError: unknown) {
    if (options?.reportMissing) {
      context.setError(
        discoverError instanceof Error && discoverError.message
          ? discoverError.message
          : "Failed to scan the audio path.",
      );
    } else {
      console.warn("Automatic audio discovery failed:", discoverError);
    }
  }
}

export const executeRefreshAudio: EditorCommandCallback = (context) =>
  discoverAudio(context, { reportMissing: true });
