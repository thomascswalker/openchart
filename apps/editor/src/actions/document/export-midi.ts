import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DocumentService } from "../../services/document";

export class ExportMidiAction extends Action {
  constructor() {
    super({ condition: { "document.has-tracks": true } });
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const document = accessor.get<DocumentService>("document");
    const state = document.getSnapshot();
    if (!state.midi?.trackCount) {
      throw new Error("There is no MIDI document to export.");
    }
    const { bytes, suggestedName } = document.export();
    await document.writeFiles([
      { name: suggestedName, bytes, mimeType: "audio/midi" },
      {
        name: "info.json",
        bytes: new TextEncoder().encode(
          JSON.stringify(document.metadata, null, 2),
        ),
        mimeType: "application/json",
      },
    ]);
  }
}
