import { Midi } from "@midiedit/core";
import { openFile } from "../project/fileService";
import { createProjectMetadata } from "../project/projectMetadata";
import { deserializeProject } from "../project/projectService";
import type { EditorCommandCallback } from "./command";
import { midiFilePickerTypes, projectFilePickerTypes } from "./shared";

const OPEN_DOCUMENT_FILE_PICKER_TYPES: FilePickerAcceptType[] = [
  ...midiFilePickerTypes,
  ...projectFilePickerTypes,
];

function hasMidiExtension(fileName: string): boolean {
  return /\.(mid|midi)$/i.test(fileName);
}

function applyMidi(
  context: Parameters<EditorCommandCallback>[0],
  name: string,
  bytes: Uint8Array,
  handle: FileSystemFileHandle | null,
): void {
  if (!hasMidiExtension(name)) {
    throw new Error("Choose a MIDI file (.mid or .midi).");
  }
  context.setMidiData(new Midi(bytes));
  context.setProjectMetadata(
    createProjectMetadata(name.replace(/\.midi?$/i, "")),
  );
  context.setFileName(name);
  context.setFileHandle(handle);
  context.setIsDirty(false);
}

export const executeOpenFile: EditorCommandCallback = async (context) => {
  if (
    context.isDirty &&
    !window.confirm(
      "This document has unsaved changes. Discard them and continue?",
    )
  ) {
    return;
  }

  const opened = await openFile(OPEN_DOCUMENT_FILE_PICKER_TYPES);
  if (!opened) return;

  if (/\.midproject$/i.test(opened.name)) {
    const document = await deserializeProject(opened.bytes, {
      fileName: opened.name,
      fileHandle: opened.handle,
    });
    context.setMidiData(document.midi);
    context.setProjectMetadata(document.metadata);
    context.setFileName(opened.name);
    context.setFileHandle(opened.handle);
    context.setIsDirty(false);
    return;
  }

  applyMidi(context, opened.name, opened.bytes, opened.handle);
};
