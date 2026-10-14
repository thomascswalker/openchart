import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import Platform from "../../../platform";
import { DocumentService } from "../../../services/document";
import { UpdaterService } from "../../../services/updater";
import { UpdateDialog } from "../UpdateDialog";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));

const updater = (): UpdaterService =>
  Platform.services.get<UpdaterService>("updater");

function availableUpdate() {
  return {
    version: "0.1.9",
    currentVersion: "0.1.8",
    body: "Faster highway rendering",
    downloadAndInstall: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
}

function renderDialog(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<UpdateDialog />));
  return { container, root };
}

function buttonLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLButtonElement>("button")]
    .map((button) => button.textContent?.trim() ?? "")
    .filter(Boolean);
}

describe("UpdateDialog", () => {
  afterEach(() => {
    act(() => {
      updater().reset();
      Platform.services.get<DocumentService>("document").isDirty = false;
    });
    mocks.check.mockReset();
    mocks.relaunch.mockReset();
  });

  it("renders nothing while idle", () => {
    const { container, root } = renderDialog();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it("tells the user when they are up to date", async () => {
    mocks.check.mockResolvedValue(null);
    const { container, root } = renderDialog();
    await act(async () => updater().check());
    expect(container.textContent).toContain("latest version");
    expect(buttonLabels(container)).toContain("OK");

    act(() =>
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "OK")!
        .click(),
    );
    expect(updater().getSnapshot().status).toBe("idle");
    act(() => root.unmount());
    container.remove();
  });

  it("offers to install an available update", async () => {
    mocks.check.mockResolvedValue(availableUpdate());
    const { container, root } = renderDialog();
    await act(async () => updater().check());

    expect(container.textContent).toContain("Version 0.1.9 is available");
    expect(container.textContent).toContain("Faster highway rendering");
    expect(buttonLabels(container)).toEqual(
      expect.arrayContaining(["Later", "Install and restart"]),
    );
    expect(container.textContent).not.toContain("unsaved changes");
    act(() => root.unmount());
    container.remove();
  });

  it("warns about unsaved changes when the document is dirty", async () => {
    mocks.check.mockResolvedValue(availableUpdate());
    act(
      () => (Platform.services.get<DocumentService>("document").isDirty = true),
    );
    const { container, root } = renderDialog();
    await act(async () => updater().check());
    expect(container.textContent).toContain("unsaved changes");
    act(() => root.unmount());
    container.remove();
  });

  it("shows check errors", async () => {
    mocks.check.mockRejectedValue(new Error("network unreachable"));
    const { container, root } = renderDialog();
    await act(async () => updater().check());
    expect(container.textContent).toContain(
      "Couldn't check for updates: network unreachable",
    );
    expect(buttonLabels(container)).toContain("Close");
    act(() => root.unmount());
    container.remove();
  });
});
