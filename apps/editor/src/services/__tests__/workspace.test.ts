import { describe, expect, it } from "vitest";
import { mockWorkspaceService } from "../__mock__/workspace.mock";

describe("mockWorkspaceService", () => {
  it("returns an object with rootHandle undefined", () => {
    const service = mockWorkspaceService();
    expect(service.rootHandle).toBeUndefined();
  });
});
