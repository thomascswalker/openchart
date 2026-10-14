import Platform from "./platform";
import { DocumentService } from "./services/document/document";
import { EditorStateService } from "./services/editor/state";
import { ViewportService } from "./services/editor/viewports";

/**
 * Resets editor state before mounting the runtime.
 */
export function bootstrap(): void {
  // Start with a clean editor, document, and viewport state.
  Platform.services.get<EditorStateService>("editor.state").reset();
  Platform.services.get<DocumentService>("document").reset();
  Platform.services.get<ViewportService>("editor.viewports").reset();
}
