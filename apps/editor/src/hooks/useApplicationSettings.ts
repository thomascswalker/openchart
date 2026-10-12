import { useSyncExternalStore } from "react";
import Platform from "../platform";
import { SettingsService } from "../services/settings";

export function useApplicationSettings() {
  const settingsService = Platform.services.get<SettingsService>("settings");
  const settings = useSyncExternalStore(
    settingsService.subscribe,
    settingsService.getSnapshot,
    settingsService.getSnapshot,
  );
  return {
    settings,
    applySettings: settingsService.applySettings,
    applySetting: settingsService.applySetting,
  };
}
