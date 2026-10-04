import { Midi } from "@midiedit/core";
import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { openFile } from "../../project/fileService";
import { createProjectMetadata } from "../../project/projectMetadata";
import { deserializeProject } from "../../project/projectService";
import {
  midiFilePickerTypes,
  projectFilePickerTypes,
} from "../../project/fileTypes";
import { DocumentService } from "../../services/document";

const openFilePickerTypes = [...midiFilePickerTypes, ...projectFilePickerTypes];

function hasMidiExtension(fileName: string): boolean {
  return /\.(mid|midi)$/i.test(fileName);
}

export class OpenDocumentAction extends Action {
  constructor() {
    super({});
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const documentService = accessor.get<DocumentService>("document");
    if (
      documentService.isDirty() &&
      !window.confirm(
        "This document has unsaved changes. Discard them and continue?",
      )
    ) {
      return;
    }

    const opened = await openFile(openFilePickerTypes);
    if (!opened) return;

    if (/\.midproject$/i.test(opened.name)) {
      const openedDocument = await deserializeProject(opened.bytes, {
        fileName: opened.name,
        fileHandle: opened.handle,
      });
      documentService.setMidiData(openedDocument.midi);
      documentService.setProjectMetadata(openedDocument.metadata);
    } else {
      if (!hasMidiExtension(opened.name)) {
        throw new Error("Choose a MIDI file (.mid or .midi).");
      }
      documentService.setMidiData(new Midi(opened.bytes));
      documentService.setProjectMetadata(
        createProjectMetadata(opened.name.replace(/\.midi?$/i, "")),
      );
    }
    documentService.setFileName(opened.name);
    documentService.setFileHandle(opened.handle);
    documentService.setClean();
  }
}
