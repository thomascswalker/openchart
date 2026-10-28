import { describe, expect, it, vi } from "vitest";
import type { ServicesAccessor } from "../../../platform/services";
import {
  makeDefaultMetadata,
  MetadataSchema,
} from "../../../services/document/schema";
import { ApplyProjectMetadataAction } from "../apply-project-metadata";

describe("ApplyProjectMetadataAction", () => {
  it("updates mixer tracks whose audio paths changed", async () => {
    const previousMetadata = makeDefaultMetadata();
    previousMetadata.audio.lead = "old-lead.wav";
    previousMetadata.audio.bass = "bass.wav";
    const root = {
      queryPermission: vi.fn().mockResolvedValue("granted"),
      requestPermission: vi.fn().mockResolvedValue("granted"),
    } as unknown as FileSystemDirectoryHandle;
    const document = {
      metadata: previousMetadata,
      metadataSchema: MetadataSchema,
      snapshot: { directoryHandle: root },
    };
    const removeTrack = vi.fn();
    const addTrack = vi.fn().mockResolvedValue(undefined);
    const clearError = vi.fn();
    const setError = vi.fn();
    const services = {
      document,
      mixer: { removeTrack, addTrack },
      "editor.state": { clearError, setError },
    };
    const accessor: ServicesAccessor = {
      get: <T>(id: string) => services[id as keyof typeof services] as T,
    };
    const metadata = makeDefaultMetadata();
    metadata.audio.lead = "new-lead.wav";

    const issues = await new ApplyProjectMetadataAction().run(
      accessor,
      metadata,
    );

    expect(issues).toEqual([]);
    expect(removeTrack.mock.calls).toEqual([["lead"], ["bass"]]);
    expect(addTrack.mock.calls).toEqual([["lead", "new-lead.wav", root, null]]);
    expect(document.metadata).toEqual(metadata);
    expect(clearError).toHaveBeenCalledOnce();
    expect(setError).not.toHaveBeenCalled();
  });

  it("loads nested audio paths from a selected audio root", async () => {
    const projectRoot = {} as FileSystemDirectoryHandle;
    const document = {
      metadata: makeDefaultMetadata(),
      metadataSchema: MetadataSchema,
      snapshot: { directoryHandle: projectRoot },
    };
    const removeTrack = vi.fn();
    const addTrack = vi.fn().mockResolvedValue(undefined);
    const clearError = vi.fn();
    const setError = vi.fn();
    const services = {
      document,
      mixer: { removeTrack, addTrack },
      "editor.state": { clearError, setError },
    };
    const accessor: ServicesAccessor = {
      get: <T>(id: string) => services[id as keyof typeof services] as T,
    };
    const metadata = makeDefaultMetadata();
    metadata.audio.root = "stems";
    metadata.audio.lead = "lead.wav";

    const issues = await new ApplyProjectMetadataAction().run(
      accessor,
      metadata,
    );

    expect(issues).toEqual([]);
    expect(addTrack.mock.calls).toEqual([
      ["lead", "lead.wav", projectRoot, "stems"],
    ]);
  });

  it("requires audio paths to be project-folder siblings without a custom root", async () => {
    const projectRoot = {} as FileSystemDirectoryHandle;
    const document = {
      metadata: makeDefaultMetadata(),
      metadataSchema: MetadataSchema,
      snapshot: { directoryHandle: projectRoot },
    };
    const removeTrack = vi.fn();
    const addTrack = vi.fn();
    const clearError = vi.fn();
    const setError = vi.fn();
    const services = {
      document,
      mixer: { removeTrack, addTrack },
      "editor.state": { clearError, setError },
    };
    const accessor: ServicesAccessor = {
      get: <T>(id: string) => services[id as keyof typeof services] as T,
    };
    const metadata = makeDefaultMetadata();
    metadata.audio.lead = "stems/lead.wav";

    const issues = await new ApplyProjectMetadataAction().run(
      accessor,
      metadata,
    );

    expect(issues).toEqual([
      {
        path: "$.audio.lead",
        message:
          "Without an audio root folder, audio files must be beside notes.mid and info.json.",
      },
    ]);
    expect(removeTrack).not.toHaveBeenCalled();
    expect(addTrack).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledOnce();
  });

  it("reloads existing tracks when the audio root path changes", async () => {
    const projectRoot = {} as FileSystemDirectoryHandle;
    const previousMetadata = makeDefaultMetadata();
    previousMetadata.audio.root = "old-stems";
    previousMetadata.audio.lead = "lead.wav";
    const document = {
      metadata: previousMetadata,
      metadataSchema: MetadataSchema,
      snapshot: { directoryHandle: projectRoot },
    };
    const removeTrack = vi.fn();
    const addTrack = vi.fn().mockResolvedValue(undefined);
    const clearError = vi.fn();
    const setError = vi.fn();
    const services = {
      document,
      mixer: { removeTrack, addTrack },
      "editor.state": { clearError, setError },
    };
    const accessor: ServicesAccessor = {
      get: <T>(id: string) => services[id as keyof typeof services] as T,
    };
    const metadata = {
      ...previousMetadata,
      audio: { ...previousMetadata.audio },
    };
    metadata.audio.root = "new-stems";

    const issues = await new ApplyProjectMetadataAction().run(
      accessor,
      metadata,
    );

    expect(issues).toEqual([]);
    expect(removeTrack).toHaveBeenCalledWith("lead");
    expect(addTrack).toHaveBeenCalledWith(
      "lead",
      "lead.wav",
      projectRoot,
      "new-stems",
    );
  });

  it("reapplies unchanged audio paths when opening a project", async () => {
    const projectRoot = {} as FileSystemDirectoryHandle;
    const metadata = makeDefaultMetadata();
    metadata.audio.song = "song.wav";
    const document = {
      metadata,
      metadataSchema: MetadataSchema,
      snapshot: { directoryHandle: projectRoot },
    };
    const removeTrack = vi.fn();
    const addTrack = vi.fn().mockResolvedValue(undefined);
    const clearError = vi.fn();
    const setError = vi.fn();
    const services = {
      document,
      mixer: { removeTrack, addTrack },
      "editor.state": { clearError, setError },
    };
    const accessor: ServicesAccessor = {
      get: <T>(id: string) => services[id as keyof typeof services] as T,
    };

    const issues = await new ApplyProjectMetadataAction().run(
      accessor,
      metadata,
      true,
    );

    expect(issues).toEqual([]);
    expect(removeTrack).toHaveBeenCalledWith("song");
    expect(addTrack).toHaveBeenCalledWith(
      "song",
      "song.wav",
      projectRoot,
      null,
    );
  });

  it("does not change mixer tracks when metadata is invalid", async () => {
    const document = {
      metadata: makeDefaultMetadata(),
      metadataSchema: MetadataSchema,
    };
    const removeTrack = vi.fn();
    const addTrack = vi.fn();
    const clearError = vi.fn();
    const setError = vi.fn();
    const services = {
      document,
      mixer: { removeTrack, addTrack },
      "editor.state": { clearError, setError },
    };
    const accessor: ServicesAccessor = {
      get: <T>(id: string) => services[id as keyof typeof services] as T,
    };

    const issues = await new ApplyProjectMetadataAction().run(accessor, {});

    expect(issues.length).toBeGreaterThan(0);
    expect(removeTrack).not.toHaveBeenCalled();
    expect(addTrack).not.toHaveBeenCalled();
    expect(clearError).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledOnce();
  });
});
