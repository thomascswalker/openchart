import type { EditorCommandCallback } from "./command";
import { saveBytes } from "../project/fileService";
import { exportMidi as exportProjectMidi } from "../project/projectService";
import { midiFilePickerTypes } from "./shared";

export const executeExportMidi: EditorCommandCallback = async (context) => {
  const document = context.projectDocument;
  if (!context.midiData?.trackCount || !document) {
    throw new Error("There is no MIDI document to export.");
  }
  const result = exportProjectMidi(document);
  await saveBytes(
    result.bytes,
    result.suggestedName,
    midiFilePickerTypes,
    "audio/midi",
  );
};
