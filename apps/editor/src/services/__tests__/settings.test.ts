import { afterEach, describe, expect, it, vi } from "vitest";
import { Service, ServiceRegistry } from "../../platform/services";
import { SettingsService } from "../settings";
import { DefaultApplicationSettings } from "../settings/schema";
import { mockWorkspaceService } from "../__mock__/workspace.mock";

class TestWorkspaceService extends Service {
  public readonly reset = (): void => {};
}

describe("SettingsService", () => {
  const values = new Map<string, string>();

  afterEach(() => {
    values.clear();
    vi.unstubAllGlobals();
  });

  it("registers services that define methods as instance fields", () => {
    const services = new ServiceRegistry({
      "../services/settings.ts": { SettingsService },
      "../services/workspace.ts": { WorkspaceService: TestWorkspaceService },
    });

    expect(services.get("settings")).toBeInstanceOf(SettingsService);
  });

  it("silently drops legacy song-audio settings when loading and saving", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    values.set(
      "openchart.application-settings",
      JSON.stringify({
        ...DefaultApplicationSettings,
        saving: { defaultSaveMode: "project" },
        audio: { rootPath: "/legacy", multitrack: true },
        discovery: { songRegex: "legacy" },
        feedback: {
          ...DefaultApplicationSettings.feedback,
          metronomeEnabled: true,
        },
      }),
    );

    const service = new SettingsService(mockWorkspaceService());
    expect(service.getSnapshot()).not.toHaveProperty("audio");
    expect(service.getSnapshot()).not.toHaveProperty("discovery");
    expect(service.getSnapshot()).not.toHaveProperty("saving");
    expect(service.getSnapshot().feedback.metronomeEnabled).toBe(true);
    expect(service.applySettings(service.getSnapshot())).toBe(true);

    const saved = JSON.parse(
      values.get("openchart.application-settings") ?? "{}",
    );
    expect(saved).not.toHaveProperty("audio");
    expect(saved).not.toHaveProperty("discovery");
    expect(saved).not.toHaveProperty("saving");
  });

  it("fills graphics defaults when loading settings saved before graphics options", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () =>
          JSON.stringify({
            version: DefaultApplicationSettings.version,
            feedback: DefaultApplicationSettings.feedback,
            history: DefaultApplicationSettings.history,
          }),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    const service = new SettingsService(mockWorkspaceService());

    expect(service.getSettings().display.antialiasing).toBe(true);
    expect(service.getSettings().display.scrollSpeed).toBe(1);
    expect(service.applySettings(service.getSettings())).toBe(true);
  });

  it("validates the application highway visual speed range", () => {
    const settings = structuredClone(DefaultApplicationSettings);

    settings.display.scrollSpeed = 0.49;
    settings.display.scrollSpeed = 4.01;
    settings.display.scrollSpeed = 2;
  });

  it("applies one setting while preserving the other application settings", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const service = new SettingsService(mockWorkspaceService());
    const original = service.getSettings();

    expect(service.apply("display.scrollSpeed", 1.5)).toBe(true);
    expect(service.getSettings()).toEqual({
      ...original,
      display: { ...original.display, scrollSpeed: 1.5 },
    });
    expect(
      JSON.parse(values.get("openchart.application-settings") ?? "{}").display
        .scrollSpeed,
    ).toBe(1.5);

    expect(service.apply("display.scrollSpeed", 4.5)).toBe(false);
    expect(service.getSettings().display.scrollSpeed).toBe(1.5);
  });
});
