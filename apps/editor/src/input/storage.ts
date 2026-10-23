import type { CustomHotkeys } from "./lib.ts";

export const HOTKEYS_STORAGE_KEY = "openchart.hotkeys";

/**
 * Loads the user's custom hotkeys (only the differences from the defaults,
 * keyed by binding id; `null` means unbound). The Hotkey Editor will write
 * through the provider's `onCustomHotkeysChange`, which calls `save` below.
 */
export function loadCustomHotkeys(): CustomHotkeys {
  try {
    const raw = globalThis.localStorage?.getItem(HOTKEYS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) => value === null || typeof value === "string",
      ),
    ) as CustomHotkeys;
  } catch {
    return {};
  }
}

export function saveCustomHotkeys(custom: CustomHotkeys): void {
  try {
    globalThis.localStorage?.setItem(
      HOTKEYS_STORAGE_KEY,
      JSON.stringify(custom),
    );
  } catch {
    // Storage may be unavailable (private mode, quota); hotkeys still work.
  }
}
