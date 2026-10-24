import { isTauri } from "@tauri-apps/api/core";
import Platform from "./platform";
import { DocumentService } from "./services/document";
import type { EditingService } from "./services/editor/editing";
import { EditorStateService } from "./services/editor/state";
import { ViewportService } from "./services/editor/viewports";

/**
 * Resets editor state before mounting the runtime.
 */
export function bootstrap(): void {
  // Start with a clean editor, document, and viewport state.
  Platform.services.get<EditorStateService>("editor.state").reset();
  Platform.services.get<DocumentService>("document").reset();
  Platform.services.get<EditingService>("editor.editing").reset();
  Platform.services.get<ViewportService>("editor.viewports").reset();

  // Desktop-only features (e.g. the updater) are gated on this flag.
  Platform.context.set("platform.is-tauri", isTauri());
}
