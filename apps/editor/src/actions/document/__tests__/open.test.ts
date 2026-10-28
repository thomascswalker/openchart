import { describe, expect, it, vi } from "vitest";
import type { ServicesAccessor } from "../../../platform/services";
import {
  makeDefaultMetadata,
  MetadataSchema,
} from "../../../services/document/schema";
import { OpenDocumentAction } from "../open";

describe("OpenDocumentAction", () => {
  it("resets audio and reloads the project metadata audio paths", async () => {
    const root = {} as FileSystemDirectoryHandle;
    const metadata = makeDefaultMetadata();
    metadata.audio.root = "stems";
    metadata.audio.lead = "lead.wav";
    const document = {
      isDirty: false,
      open: vi.fn(async () => true),
      metadata,
      metadataSchema: MetadataSchema,
      snapshot: { directoryHandle: root },
    };
    const removeTrack = vi.fn();
    const addTrack = vi.fn().mockResolvedValue(undefined);
    const mixer = {
      reset: vi.fn(),
      removeTrack,
      addTrack,
    };
    const services = {
      logger: { info: vi.fn(), error: vi.fn() },
      document,
      mixer,
      "editor.state": { clearError: vi.fn(), setError: vi.fn() },
    };
    const accessor: ServicesAccessor = {
      get: <T>(id: string) => services[id as keyof typeof services] as T,
    };

    await new OpenDocumentAction().run(accessor);

    expect(document.open).toHaveBeenCalledOnce();
    expect(mixer.reset).toHaveBeenCalledOnce();
    expect(removeTrack).toHaveBeenCalledWith("lead");
    expect(addTrack).toHaveBeenCalledWith("lead", "lead.wav", root, "stems");
    expect(document.isDirty).toBe(false);
  });
});
