import { useSyncExternalStore } from 'react';

import Platform from '../platform';
import { EditorStateService } from '../platform/services/editor/state';

export function useEditor() {
  const editorState = Platform.services.get<EditorStateService>('editor.state');
  const editor = useSyncExternalStore(
    editorState.subscribe,
    editorState.getSnapshot,
    editorState.getSnapshot,
  );

  return editor;
}
