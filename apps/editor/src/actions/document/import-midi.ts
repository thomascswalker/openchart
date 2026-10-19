import { Midi } from "@openchart/core";
import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DocumentService } from "../../services/document";
import type { FileSystemService } from "../../services/filesystem";
import { LoggerService } from "../../services/logger";
import { MidiFilePickerTypes } from "../../services/document/types";

export class ImportMidiAction extends Action {
  constructor() {
    super({});
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const logger = accessor.get<LoggerService>("logger");
    const document = accessor.get<DocumentService>("document");
    const fileSystem = accessor.get<FileSystemService>("filesystem");

    try {
      const imported = await fileSystem.read(MidiFilePickerTypes);
      if (!imported) return;
      if (!/\.(mid|midi)$/i.test(imported.name)) {
        throw new Error("Choose a MIDI file (.mid or .midi).");
      }
      document.data = new Midi(imported.bytes);
      logger.info(`MIDI imported: ${imported.name}`);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.info(`Closed MIDI import dialog: ${error.message}`);
        return;
      }
      if (error instanceof Error) logger.error(error.message);
      throw error;
    }
  }
}
