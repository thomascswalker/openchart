import type { EditorCommandCallback } from "./command";
import { saveBytes } from "../project/fileService";
import {
  exportMidi as exportProjectMidi,
  serializeProject,
} from "../project/projectService";
import { midiFilePickerTypes, projectFilePickerTypes } from "./shared";

export const executeSaveFileAs: EditorCommandCallback = async (context) => {
  const document = context.projectDocument;
  if (!context.midiData?.trackCount || !document) {
    throw new Error("There is no MIDI document to save.");
  }

  const saveAsProject = context.settings.saving.defaultSaveMode === "project";
  const exportResult = saveAsProject ? null : exportProjectMidi(document);
  const suggestedName = saveAsProject
    ? `${(context.fileName ?? context.projectMetadata.Song.Name ?? "untitled").replace(/\.(midproject|midi?)$/i, "")}.midproject`
    : exportResult!.suggestedName;
  const bytes = saveAsProject
    ? await serializeProject(document)
    : exportResult!.bytes;
  const saved = await saveBytes(
    bytes,
    suggestedName,
    saveAsProject ? projectFilePickerTypes : midiFilePickerTypes,
    saveAsProject ? "application/zip" : "audio/midi",
  );
  context.setFileHandle(saved.handle);
  context.setFileName(saved.name);
  context.setIsDirty(false);
};
