import { describe, expect, it } from "vitest";
import { testWorkspaceService } from "./utils";

describe("Workspace Service", () => {
  it("returns a snapshot", () => {
    const service = testWorkspaceService();
    expect(service.getSnapshot()).toBeDefined();
  });
});
