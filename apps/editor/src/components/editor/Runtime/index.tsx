import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePlatform, useService } from "../../../platform";
import { useSettings } from "../../../hooks/useApplication";
import { useDocument } from "../../../hooks/useDocument";
import { useViewport } from "../../../hooks/useViewport";
import { DocumentService } from "../../../services/document";
import { EditorStateService } from "../../../services/editor/state";
import type { EditingService } from "../../../services/editor/editing";
import { createEditingContextSnapshot } from "../../../services/editor/editingContext";
import { Playback } from "../Playback";

interface RuntimeProps {
  children: ReactNode;
}

export function Runtime({ children }: RuntimeProps) {
  const { settings } = useSettings();

  const { midi: midiData, canUndo: canUndo, canRedo: canRedo } = useDocument();
  const { viewportSessions, maxViewportCount, activeViewportId } =
    useViewport();

  const doc = useService<DocumentService>("document");
  const editorState = useService<EditorStateService>("editor.state");
  const editing = useService<EditingService>("editor.editing");

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
  const editingSession = editing.getEditingSession(activeSession?.id);
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
      "document.has-tracks": hasTracks,
      "history.can-undo": canUndo,
      "history.can-redo": canRedo,
      "dialog.project-open": editorStore.projectVisible,
      "dialog.settings-open": editorStore.settingsVisible,
      "dialog.about-open": editorStore.aboutVisible,
      "dialog.any-open": isAnyDialogOpen,
      "viewport.active-view": activeView,
      ...editingContext.values,
      "editor.can-add-viewport": canAddViewport,
      "editor.can-close-viewport": canCloseViewport,
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
    doc.setHistoryCapacity(settings.history.capacity);
  }, [doc, settings.history.capacity]);

  return <Playback>{children}</Playback>;
}
