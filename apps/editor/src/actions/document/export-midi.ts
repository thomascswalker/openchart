import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { exportMidi } from "../../project/projectService";
import { midiFilePickerTypes } from "../../services/document/types";
import { DocumentService } from "../../services/document/document";
import { FileSystemService } from "../../services/filesystem";

export class ExportMidiAction extends Action {
  constructor() {
    super({ condition: { "document.has-tracks": true } });
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const state = accessor.get<DocumentService>("document").getSnapshot();
    const fileSystem = accessor.get<FileSystemService>("filesystem");
    const document = state.projectDocument;
    if (!state.midi?.trackCount || !document) {
      throw new Error("There is no MIDI document to export.");
    }
    const result = exportMidi(document);
    await fileSystem.write(
      result.bytes,
      result.suggestedName,
      midiFilePickerTypes,
      "audio/midi",
    );
  }
}
