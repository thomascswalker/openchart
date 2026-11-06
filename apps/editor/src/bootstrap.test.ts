import { afterEach, describe, expect, it, vi } from 'vitest';

import { bootstrap } from './bootstrap';
import Platform from './platform';
import { EditorStateService } from './platform/services/editor/state';
import { ViewportService } from './platform/services/editor/viewports';
import { ProjectService } from './platform/services/project/project';

describe('bootstrap', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resets application services without React', () => {
    const editorState =
      Platform.services.get<EditorStateService>('editor.state');
    const project = Platform.services.get<ProjectService>('project');
    const viewports =
      Platform.services.get<ViewportService>('editor.viewports');

    const resetEditorState = vi
      .spyOn(editorState, 'reset')
      .mockImplementation(() => {});
    const resetProject = vi
      .spyOn(project, 'reset')
      .mockImplementation(() => {});
    const resetViewports = vi
      .spyOn(viewports, 'reset')
      .mockImplementation(() => {});
    bootstrap();

    expect(resetEditorState).toHaveBeenCalledOnce();
    expect(resetProject).toHaveBeenCalledOnce();
    expect(resetViewports).toHaveBeenCalledOnce();
  });
});
