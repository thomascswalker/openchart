import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceRegistry } from "../../platform/services";
import { defaultApplicationSettings, SettingsService } from "../settings";

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
      "midiedit.application-settings",
      JSON.stringify({
        ...defaultApplicationSettings,
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
    expect(service.getSnapshot().feedback.metronomeEnabled).toBe(true);
    expect(service.applySettings(service.getSnapshot())).toBe(true);

    const saved = JSON.parse(
      values.get("midiedit.application-settings") ?? "{}",
    );
    expect(saved).not.toHaveProperty("audio");
    expect(saved).not.toHaveProperty("discovery");
  });
});
