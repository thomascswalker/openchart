import Platform from "./platform";
import { AudioService } from "./services/audio";
import { DocumentService } from "./services/document";
import { EditorStateService } from "./services/editor/state";
import { ViewportService } from "./services/editor/viewports";

/**
 * Resets editor state and initializes audio services.
 */
export function bootstrap(): void {
  // Resolve the audio service before resetting the application services.
  const audio = Platform.services.get<AudioService>("audio");

  // Start with a clean editor, document, and viewport state.
  Platform.services.get<EditorStateService>("editor.state").reset();
  Platform.services.get<DocumentService>("document").reset();
  Platform.services.get<ViewportService>("editor.viewports").reset();

  // Initialize audio after the editor state has been reset.
  audio.initialize();
}
