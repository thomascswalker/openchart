import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { saveBytes } from "../../project/fileService";
import { exportMidi, serializeProject } from "../../project/projectService";
import {
  midiFilePickerTypes,
  projectFilePickerTypes,
} from "../../project/fileTypes";
import { DocumentService } from "../../services/document";

function hasMidiExtension(fileName: string): boolean {
  return /\.(mid|midi)$/i.test(fileName);
}

export class SaveDocumentAction extends Action {
  constructor() {
    super({ condition: { "document.has-tracks": true } });
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const service = accessor.get<DocumentService>("document");
    const context = service.getSnapshot();
    const document = context.projectDocument;
    if (!context.midiData?.trackCount || !document) {
      throw new Error("There is no MIDI document to save.");
    }
    if (!context.fileHandle) {
      await import("./save-as").then(({ SaveDocumentAsAction }) =>
        new SaveDocumentAsAction().run(accessor),
      );
      return;
    }

    const saveAsMidi = hasMidiExtension(
      context.fileName ?? context.fileHandle.name,
    );
    const midiExport = saveAsMidi ? exportMidi(document) : null;
    const bytes = saveAsMidi
      ? midiExport!.bytes
      : await serializeProject(document);
    const saved = await saveBytes(
      bytes,
      context.fileHandle.name,
      saveAsMidi ? midiFilePickerTypes : projectFilePickerTypes,
      saveAsMidi ? "audio/midi" : "application/zip",
      context.fileHandle,
    );
    service.setFileName(saved.name);
    service.setClean();
  }
}
