import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DocumentService } from "../../services/document";
import { FileSystemService } from "../../services/filesystem";

export class ExportMidiAction extends Action {
  constructor() {
    super({ condition: { "document.has-tracks": true } });
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const document = accessor.get<DocumentService>("document");
    const state = document.getSnapshot();
    const fileSystem = accessor.get<FileSystemService>("filesystem");
    if (!state.midi?.trackCount) {
      throw new Error("There is no MIDI document to export.");
    }
    const result = document.exportMidi();
    await fileSystem.writeMidi(
      result.bytes,
      JSON.stringify(document.metadata, null, 2),
      result.suggestedName,
    );
  }
}
