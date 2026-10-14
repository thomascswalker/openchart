import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { exportMidi, serializeProject } from "../../project/projectService";
import {
  midiFilePickerTypes,
  projectFilePickerTypes,
} from "../../services/document/types";
import { DocumentService } from "../../services/document/document";
import { FileSystemService } from "../../services/filesystem";

function hasMidiExtension(fileName: string): boolean {
  return /\.(mid|midi)$/i.test(fileName);
}

export class SaveDocumentAction extends Action {
  constructor() {
    super({ condition: { "document.has-tracks": true } });
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const service = accessor.get<DocumentService>("document");
    const fileSystem = accessor.get<FileSystemService>("filesystem");
    const context = service.getSnapshot();
    const document = context.projectDocument;
    if (!context.midi?.trackCount || !document) {
      throw new Error("There is no MIDI document to save.");
    }
    if (!context.handle) {
      await import("./save-as").then(({ SaveDocumentAsAction }) =>
        new SaveDocumentAsAction().run(accessor),
      );
      return;
    }

    const saveAsMidi = hasMidiExtension(context.file ?? context.handle.name);
    const midiExport = saveAsMidi ? exportMidi(document) : null;
    const bytes = saveAsMidi
      ? midiExport!.bytes
      : await serializeProject(document);
    const saved = await fileSystem.write(
      bytes,
      context.handle.name,
      saveAsMidi ? midiFilePickerTypes : projectFilePickerTypes,
      saveAsMidi ? "audio/midi" : "application/zip",
      context.handle,
    );
    service.setFileBinding(saved.name, saved.handle);
    service.setClean();
  }
}
