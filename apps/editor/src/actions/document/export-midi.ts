import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { saveBytes } from "../../project/fileService";
import { exportMidi } from "../../project/projectService";
import { midiFilePickerTypes } from "../../project/fileTypes";
import { DocumentService } from "../../services/document";

export class ExportMidiAction extends Action {
  constructor() {
    super({ condition: { "document.has-tracks": true } });
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const state = accessor.get<DocumentService>("document").getSnapshot();
    const document = state.projectDocument;
    if (!state.midiData?.trackCount || !document) {
      throw new Error("There is no MIDI document to export.");
    }
    const result = exportMidi(document);
    await saveBytes(
      result.bytes,
      result.suggestedName,
      midiFilePickerTypes,
      "audio/midi",
    );
  }
}
