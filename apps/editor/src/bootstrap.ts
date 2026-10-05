import Platform from "./platform";
import { AudioService } from "./services/audio";
import { DocumentService } from "./services/document";
import { EditorStateService } from "./services/editor/state";
import { ViewportService } from "./services/editor/viewports";

export function bootstrapEditorServices(): void {
  const audio = Platform.services.get<AudioService>("audio");
  Platform.services.get<EditorStateService>("editor.state").reset();
  Platform.services.get<DocumentService>("document").reset();
  Platform.services.get<ViewportService>("editor.viewports").reset();
  void audio.initialize();
}
