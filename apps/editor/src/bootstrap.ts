import { useService } from "./platform";
import { AudioService } from "./services/audio";
import { DocumentService } from "./services/document";
import { EditorStateService } from "./services/editor/state";
import { ViewportService } from "./services/editor/viewports";

/**
 * Resets editor state and initializes audio services.
 */
export function bootstrap(): void {
  // Resolve the audio service before resetting the application services.
  const audio = useService<AudioService>("audio");

  // Start with a clean editor, document, and viewport state.
  useService<EditorStateService>("editor.state").reset();
  useService<DocumentService>("document").reset();
  useService<ViewportService>("editor.viewports").reset();

  // Initialize audio after the editor state has been reset.
  audio.initialize();
}
