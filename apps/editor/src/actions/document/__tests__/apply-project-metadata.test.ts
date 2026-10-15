import { describe, expect, it, vi } from "vitest";
import type { ServicesAccessor } from "../../../platform/services";
import { makeDefaultMetadata } from "../../../services/document/schema";
import { ApplyProjectMetadataAction } from "../apply-project-metadata";

describe("ApplyProjectMetadataAction", () => {
  it("updates mixer tracks whose audio paths changed", async () => {
    const previousMetadata = makeDefaultMetadata();
    previousMetadata.audio.lead = "old-lead.wav";
    previousMetadata.audio.bass = "bass.wav";
    const document = { metadata: previousMetadata };
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
    expect(addTrack.mock.calls).toEqual([["lead"]]);
    expect(document.metadata).toEqual(metadata);
    expect(clearError).toHaveBeenCalledOnce();
    expect(setError).not.toHaveBeenCalled();
  });

  it("does not change mixer tracks when metadata is invalid", async () => {
    const document = { metadata: makeDefaultMetadata() };
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
