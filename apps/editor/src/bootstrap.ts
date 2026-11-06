import { isTauri } from '@tauri-apps/api/core';

import Platform from './platform';
import type { EditingService } from './platform/services/editor/editing';
import { EditorStateService } from './platform/services/editor/state';
import { ViewportService } from './platform/services/editor/viewports';
import { ProjectService } from './platform/services/project/project';

/**
 * Resets editor state before mounting the runtime.
 */
export function bootstrap(): void {
  // Start with a clean editor, project, and viewport state.
  Platform.services.get<EditorStateService>('editor.state').reset();
  Platform.services.get<ProjectService>('project').reset();
  Platform.services.get<EditingService>('editor.editing').reset();
  Platform.services.get<ViewportService>('editor.viewports').reset();

  // Desktop-only features (e.g. the updater) are gated on this flag.
  Platform.context.set('platform.is-tauri', isTauri());
}
