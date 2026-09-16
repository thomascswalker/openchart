import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { homeDir, join } from "@tauri-apps/api/path";
import { readDir } from "@tauri-apps/plugin-fs";

const AUDIO_EXTENSIONS = [".wav"];

export interface DiscoveredAudio {
  path: string;
  url: string;
  name: string;
}

async function resolveRootPath(rootPath: string): Promise<string> {
  const trimmed = rootPath.trim();
  if (
    trimmed === "~" ||
    trimmed.startsWith("~/") ||
    trimmed.startsWith("~\\")
  ) {
    const home = await homeDir();
    const rest = trimmed.slice(1).replace(/^[/\\]/, "");
    return rest ? await join(home, rest) : home;
  }
  return trimmed;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : String(error);
}

/**
 * Lists the WAV files present in the root audio path. Returns `null` when
 * not running under Tauri. Throws if the directory could not be read (e.g.
 * missing permission or invalid path), so callers can surface the reason.
 */
export async function listAudioFileNames(
  rootPath: string,
): Promise<string[] | null> {
  if (!isTauri()) {
    return null;
  }

  const resolvedRoot = await resolveRootPath(rootPath);

  try {
    const entries = await readDir(resolvedRoot);
    return entries
      .filter(
        (entry) =>
          entry.isFile &&
          AUDIO_EXTENSIONS.some((extension) =>
            entry.name.toLowerCase().endsWith(extension),
          ),
      )
      .map((entry) => entry.name);
  } catch (readDirError) {
    throw new Error(
      `Could not read audio path "${resolvedRoot}": ${errorMessage(readDirError)}`,
      { cause: readDirError },
    );
  }
}

/**
 * Tests whether any of the given file names matches the regex. Returns
 * `false` for an invalid regex rather than throwing.
 */
export function matchesAudioFile(fileNames: string[], regex: string): boolean {
  let pattern: RegExp;
  try {
    pattern = new RegExp(regex, "i");
  } catch {
    return false;
  }
  return fileNames.some((name) => pattern.test(name));
}

/**
 * Scans the root audio path for a single WAV file whose name matches the
 * given song regex. Only supported when running inside the Tauri desktop
 * shell, since it requires real filesystem access.
 */
export async function discoverSongAudio(
  rootPath: string,
  songRegex: string,
): Promise<DiscoveredAudio | null> {
  if (!isTauri()) {
    return null;
  }

  let pattern: RegExp;
  try {
    pattern = new RegExp(songRegex, "i");
  } catch {
    return null;
  }

  const resolvedRoot = await resolveRootPath(rootPath);

  let entries;
  try {
    entries = await readDir(resolvedRoot);
  } catch (readDirError) {
    throw new Error(
      `Could not read audio path "${resolvedRoot}": ${errorMessage(readDirError)}`,
      { cause: readDirError },
    );
  }

  const match = entries.find(
    (entry) =>
      entry.isFile &&
      AUDIO_EXTENSIONS.some((extension) =>
        entry.name.toLowerCase().endsWith(extension),
      ) &&
      pattern.test(entry.name),
  );

  if (!match) {
    return null;
  }

  const fullPath = await join(resolvedRoot, match.name);
  return { path: fullPath, url: convertFileSrc(fullPath), name: match.name };
}

/**
 * Lists the WAV files present in a browser-picked directory handle, used as
 * the fallback discovery mechanism when not running under Tauri.
 */
export async function listAudioFileNamesFromHandle(
  handle: FileSystemDirectoryHandle,
): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of handle.values()) {
    if (
      entry.kind === "file" &&
      AUDIO_EXTENSIONS.some((extension) =>
        entry.name.toLowerCase().endsWith(extension),
      )
    ) {
      names.push(entry.name);
    }
  }
  return names;
}

/**
 * Scans a browser-picked directory handle for a single WAV file whose name
 * matches the given song regex.
 */
export async function discoverSongAudioFromHandle(
  handle: FileSystemDirectoryHandle,
  songRegex: string,
): Promise<DiscoveredAudio | null> {
  let pattern: RegExp;
  try {
    pattern = new RegExp(songRegex, "i");
  } catch {
    return null;
  }

  for await (const entry of handle.values()) {
    if (
      entry.kind === "file" &&
      AUDIO_EXTENSIONS.some((extension) =>
        entry.name.toLowerCase().endsWith(extension),
      ) &&
      pattern.test(entry.name)
    ) {
      const file = await (entry as FileSystemFileHandle).getFile();
      return {
        path: entry.name,
        url: URL.createObjectURL(file),
        name: entry.name,
      };
    }
  }

  return null;
}
