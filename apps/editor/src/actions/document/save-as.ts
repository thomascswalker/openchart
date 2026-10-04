import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { saveBytes } from "../../project/fileService";
import { exportMidi, serializeProject } from "../../project/projectService";
import {
  midiFilePickerTypes,
  projectFilePickerTypes,
} from "../../project/fileTypes";
import { DocumentService } from "../../services/document";
import { SettingsService } from "../../services/settings";

export class SaveDocumentAsAction extends Action {
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

    const saveAsProject =
      accessor.get<SettingsService>("settings").getSettings().saving
        .defaultSaveMode === "project";
    const midiExport = saveAsProject ? null : exportMidi(document);
    const suggestedName = saveAsProject
      ? `${(context.fileName ?? context.projectMetadata.Song.Name ?? "untitled").replace(/\.(midproject|midi?)$/i, "")}.midproject`
      : midiExport!.suggestedName;
    const bytes = saveAsProject
      ? await serializeProject(document)
      : midiExport!.bytes;
    const saved = await saveBytes(
      bytes,
      suggestedName,
      saveAsProject ? projectFilePickerTypes : midiFilePickerTypes,
      saveAsProject ? "application/zip" : "audio/midi",
    );
    service.setFileHandle(saved.handle);
    service.setFileName(saved.name);
    service.setClean();
  }
}
