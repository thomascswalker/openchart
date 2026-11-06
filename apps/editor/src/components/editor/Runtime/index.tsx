import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';

import { useSettings } from '../../../hooks/useApplication';
import { useProject } from '../../../hooks/useProject';
import { useViewport } from '../../../hooks/useViewport';
import { usePlatform, useService } from '../../../platform';
import type { EditingService } from '../../../platform/services/editor/editing';
import { createEditingContextSnapshot } from '../../../platform/services/editor/editingContext';
import { EditorStateService } from '../../../platform/services/editor/state';
import { ProjectService } from '../../../platform/services/project/project';
import { Playback } from '../Playback';

interface RuntimeProps {
  children: ReactNode;
}

export function Runtime({ children }: RuntimeProps) {
  const { settings } = useSettings();

  const { data: midiData, canUndo: canUndo, canRedo: canRedo } = useProject();
  const { viewportSessions, maxViewportCount, activeViewportId } =
    useViewport();

  const project = useService<ProjectService>('project');
  const editorState = useService<EditorStateService>('editor.state');
  const editing = useService<EditingService>('editor.editing');

  const editorStore = useSyncExternalStore(
    editorState.subscribe,
    editorState.getSnapshot,
    editorState.getSnapshot,
  );

  const { context } = usePlatform();
  const hasTracks = Boolean(midiData?.trackCount);
  const canAddViewport = viewportSessions.length < maxViewportCount;
  const canCloseViewport = viewportSessions.length > 1;
  const activeSession = viewportSessions.find(
    (session) => session.id === activeViewportId,
  );
  const activeView = activeSession?.view ?? null;
  const editingSession = activeSession
    ? editing.getSession(activeSession.id)
    : null;
  const previousCapabilityKeys = useRef<string[]>([]);
  const isAnyDialogOpen =
    editorStore.projectVisible ||
    editorStore.settingsVisible ||
    editorStore.aboutVisible;

  useLayoutEffect(() => {
    const editingContext = createEditingContextSnapshot(
      editingSession,
      previousCapabilityKeys.current,
    );
    context.update({
      'project.has-tracks': hasTracks,
      'history.can-undo': canUndo,
      'history.can-redo': canRedo,
      'dialog.project-open': editorStore.projectVisible,
      'dialog.settings-open': editorStore.settingsVisible,
      'dialog.about-open': editorStore.aboutVisible,
      'dialog.any-open': isAnyDialogOpen,
      'viewport.active-view': activeView,
      ...editingContext.values,
      'editor.can-add-viewport': canAddViewport,
      'editor.can-close-viewport': canCloseViewport,
    });
    previousCapabilityKeys.current = editingContext.commandTypes;
  }, [
    context,
    hasTracks,
    canUndo,
    canRedo,
    editorStore.projectVisible,
    editorStore.settingsVisible,
    editorStore.aboutVisible,
    isAnyDialogOpen,
    activeView,
    editingSession,
    canAddViewport,
    canCloseViewport,
  ]);

  useEffect(() => {
    project.setHistoryCapacity(settings.history.capacity);
  }, [project, settings.history.capacity]);

  return <Playback>{children}</Playback>;
}
