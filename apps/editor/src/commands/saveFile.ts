import type { EditorCommandCallback } from "./command";
import { saveBytes } from "../project/fileService";
import {
  exportMidi as exportProjectMidi,
  serializeProject,
} from "../project/projectService";
import { executeSaveFileAs } from "./saveFileAs";
import { midiFilePickerTypes, projectFilePickerTypes } from "./shared";

function hasMidiExtension(fileName: string): boolean {
  return /\.(mid|midi)$/i.test(fileName);
}

export const executeSaveFile: EditorCommandCallback = async (context) => {
  const document = context.projectDocument;
  if (!context.midiData?.trackCount || !document) {
    throw new Error("There is no MIDI document to save.");
  }
  if (!context.fileHandle) {
    await executeSaveFileAs(context);
    return;
  }

  const saveAsMidi = hasMidiExtension(
    context.fileName ?? context.fileHandle.name,
  );
  const exportResult = saveAsMidi ? exportProjectMidi(document) : null;
  const bytes = saveAsMidi
    ? exportResult!.bytes
    : await serializeProject(document);
  const saved = await saveBytes(
    bytes,
    context.fileHandle.name,
    saveAsMidi ? midiFilePickerTypes : projectFilePickerTypes,
    saveAsMidi ? "audio/midi" : "application/zip",
    context.fileHandle,
  );
  context.setFileName(saved.name);
  context.setIsDirty(false);
};
