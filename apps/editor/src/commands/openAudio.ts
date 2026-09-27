import { Audio } from "ts-audio";
import type { ChangeEvent } from "react";
import type { AudioCommandContext, EditorCommandCallback } from "./command";
import { wavFilePickerTypes } from "./shared";

function loadAudio(context: AudioCommandContext, file: File) {
  if (!file.name.toLowerCase().endsWith(".wav")) {
    throw new Error("Choose a WAV audio file (.wav).");
  }

  const url = URL.createObjectURL(file);
  if (context.audioUrlRef.current) {
    URL.revokeObjectURL(context.audioUrlRef.current);
  }
  context.audioUrlRef.current = url;
  const player = Audio({ file: url, preload: true });
  context.setAudio(player);
  context.setAudioSource(
    { role: "single", fileName: file.name, url, enabled: true, volume: 1 },
    player,
  );
  context.setAudioFileName(file.name);
  context.setError(null);
}

export function handleAudioFileLoad(
  event: ChangeEvent<HTMLInputElement>,
  context: AudioCommandContext,
): void {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  const requestId = ++context.audioLoadRef.current;
  void file
    .arrayBuffer()
    .then(() => {
      if (requestId !== context.audioLoadRef.current) return;
      loadAudio(context, file);
    })
    .catch((loadError: unknown) => {
      if (requestId === context.audioLoadRef.current) {
        context.setError(
          loadError instanceof Error && loadError.message
            ? loadError.message
            : "Failed to open audio file.",
        );
      }
    });
}

export const executeOpenAudio: EditorCommandCallback = async (context) => {
  if (typeof window.showOpenFilePicker === "function") {
    const [handle] = await window.showOpenFilePicker({
      types: wavFilePickerTypes,
    });
    loadAudio(context, await handle.getFile());
    return;
  }
  context.audioFileRef.current?.click();
};
