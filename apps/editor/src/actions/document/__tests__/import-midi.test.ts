import { Midi } from "@openchart/midi";
import { describe, expect, it, vi } from "vitest";
import type { ServicesAccessor } from "../../../platform/services";
import { DocumentService } from "../../../services/document";
import type { LoggerService } from "../../../services/logger";
import { makeDefaultMetadata } from "../../../services/document/schema";
import { ImportMidiAction } from "../import-midi";

describe("ImportMidiAction", () => {
  it("replaces the current MIDI while preserving project metadata", async () => {
    const importedMidi = new Midi();
    importedMidi.addTrack();
    const metadata = makeDefaultMetadata();
    metadata.song.name = "Keep this metadata";
    const document = new DocumentService({
      info: vi.fn(),
    } as unknown as LoggerService);
    document.metadata = metadata;
    const read = vi.fn(async () => ({
      name: "imported.mid",
      bytes: importedMidi.toBuffer(),
      handle: null,
    }));
    const logger = { info: vi.fn(), error: vi.fn() };
    const services = {
      document,
      filesystem: { read },
      logger,
    };
    const accessor: ServicesAccessor = {
      get: <T>(id: string) => services[id as keyof typeof services] as T,
    };

    await new ImportMidiAction().run(accessor);

    expect(read).toHaveBeenCalledOnce();
    expect(document.snapshot.midi?.trackCount).toBe(1);
    expect(document.metadata).toEqual(metadata);
    expect(document.isDirty).toBe(true);
    expect(logger.info).toHaveBeenCalledWith("MIDI imported: imported.mid");
  });
});
