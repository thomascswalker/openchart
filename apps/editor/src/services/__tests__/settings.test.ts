import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceRegistry } from "../../platform/services";
import { SettingsService, validateApplicationSettings } from "../settings";
import { defaultApplicationSettings } from "../settings/schema";

describe("SettingsService", () => {
  const values = new Map<string, string>();

  afterEach(() => {
    values.clear();
    vi.unstubAllGlobals();
  });

  it("registers services that define methods as instance fields", () => {
    const services = new ServiceRegistry({
      "../services/settings.ts": { SettingsService },
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
        ...defaultApplicationSettings,
        saving: { defaultSaveMode: "project" },
        audio: { rootPath: "/legacy", multitrack: true },
        discovery: { songRegex: "legacy" },
        feedback: {
          ...defaultApplicationSettings.feedback,
          metronomeEnabled: true,
        },
      }),
    );

    const service = new SettingsService();
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
            version: defaultApplicationSettings.version,
            feedback: defaultApplicationSettings.feedback,
            history: defaultApplicationSettings.history,
          }),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    const service = new SettingsService();

    expect(service.getSettings().graphics.antialiasing).toBe(true);
    expect(service.getSettings().graphics.scrollSpeed).toBe(1);
    expect(service.applySettings(service.getSettings())).toBe(true);
  });

  it("validates the application highway visual speed range", () => {
    const settings = structuredClone(defaultApplicationSettings);

    settings.graphics.scrollSpeed = 0.49;
    expect(validateApplicationSettings(settings).scrollSpeed).toBeDefined();
    settings.graphics.scrollSpeed = 4.01;
    expect(validateApplicationSettings(settings).scrollSpeed).toBeDefined();
    settings.graphics.scrollSpeed = 2;
    expect(validateApplicationSettings(settings).scrollSpeed).toBeUndefined();
  });

  it("applies one setting while preserving the other application settings", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const service = new SettingsService();
    const original = service.getSettings();

    expect(service.applySetting("graphics.scrollSpeed", 1.5)).toBe(true);
    expect(service.getSettings()).toEqual({
      ...original,
      graphics: { ...original.graphics, scrollSpeed: 1.5 },
    });
    expect(
      JSON.parse(values.get("openchart.application-settings") ?? "{}").graphics
        .scrollSpeed,
    ).toBe(1.5);

    expect(service.applySetting("graphics.scrollSpeed", 4.5)).toBe(false);
    expect(service.getSettings().graphics.scrollSpeed).toBe(1.5);
  });
});
