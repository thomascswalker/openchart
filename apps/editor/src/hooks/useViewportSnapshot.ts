import { useSyncExternalStore } from "react";
import Platform from "../platform";
import { ViewportService } from "../services/editor/viewports";

export function useViewportSnapshot() {
  const viewports = Platform.services.get<ViewportService>("editor.viewports");
  return useSyncExternalStore(
    viewports.subscribe,
    viewports.getSnapshot,
    viewports.getSnapshot,
  );
}
