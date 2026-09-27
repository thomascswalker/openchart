import {
  requestReadPermission,
  saveAudioDirectoryHandle,
} from "../util/audioDirectoryHandle";
import { discoverAudio } from "./refreshAudio";
import type { EditorCommandCallback } from "./command";

export const executeSelectAudioFolder: EditorCommandCallback = async (
  context,
) => {
  const handle = await window.showDirectoryPicker!({ mode: "read" });
  const granted = await requestReadPermission(handle);
  if (!granted) {
    throw new Error("Permission to read the selected folder was denied.");
  }
  await saveAudioDirectoryHandle(handle);
  context.setAudioDirectoryHandle(handle);
  await discoverAudio(context, { reportMissing: true });
};
