import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DocumentService } from "../../services/document";
import { FileSystemService } from "../../services/filesystem";

export class SaveDocumentAsAction extends Action {
  constructor() {
    super({ condition: { "document.has-tracks": true } });
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const document = accessor.get<DocumentService>("document");
    const fileSystem = accessor.get<FileSystemService>("filesystem");
    const context = document.getSnapshot();
    if (!context.midi?.trackCount || !document) {
      throw new Error("There is no MIDI document to save.");
    }

    const midiExport = document.exportMidi();
    const saved = await fileSystem.writeMidi(
      midiExport.bytes,
      JSON.stringify(document.metadata, null, 2),
      midiExport.suggestedName,
    );
    document.setFileBinding(
      saved.name,
      saved.handle,
      saved.directoryHandle ?? null,
    );
    document.setClean();
  }
}
