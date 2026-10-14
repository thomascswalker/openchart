import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { exportMidi, serializeProject } from "../../project/projectService";
import {
  midiFilePickerTypes,
  projectFilePickerTypes,
} from "../../services/document/types";
import { DocumentService } from "../../services/document/document";
import { FileSystemService } from "../../services/filesystem";
import { SettingsService } from "../../services/settings";

export class SaveDocumentAsAction extends Action {
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

    const saveAsProject =
      accessor.get<SettingsService>("settings").getSettings().saving
        .defaultSaveMode === "project";
    const midiExport = saveAsProject ? null : exportMidi(document);
    const suggestedName = saveAsProject
      ? `${(context.file ?? context.projectMetadata.Song.Name ?? "untitled").replace(/\.(midproject|midi?)$/i, "")}.midproject`
      : midiExport!.suggestedName;
    const bytes = saveAsProject
      ? await serializeProject(document)
      : midiExport!.bytes;
    const saved = await fileSystem.write(
      bytes,
      suggestedName,
      saveAsProject ? projectFilePickerTypes : midiFilePickerTypes,
      saveAsProject ? "application/zip" : "audio/midi",
    );
    service.setFileBinding(saved.name, saved.handle);
    service.setClean();
  }
}
