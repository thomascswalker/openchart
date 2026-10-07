import {
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePlatform, useService } from "../platform";
import { useApplicationSettings } from "../hooks/useApplicationSettings";
import { useDocumentSnapshot } from "../hooks/useDocumentSnapshot";
import { useViewportSnapshot } from "../hooks/useViewportSnapshot";
import { DocumentService } from "../services/document";
import { EditorStateService } from "../services/editor/state";
import { Playback } from "./Playback";

interface RuntimeProps {
  children: ReactNode;
}

export function Runtime({ children }: RuntimeProps) {
  const { settings } = useApplicationSettings();

  const { midiData, canUndoMidi, canRedoMidi } = useDocumentSnapshot();
  const { viewportSessions, maxViewportCount } = useViewportSnapshot();

  const doc = useService<DocumentService>("document");
  const editorState = useService<EditorStateService>("editor.state");

  const editorStore = useSyncExternalStore(
    editorState.subscribe,
    editorState.getSnapshot,
    editorState.getSnapshot,
  );

  const { context } = usePlatform();
  const hasTracks = Boolean(midiData?.trackCount);
  const canAddViewport = viewportSessions.length < maxViewportCount;
  const canCloseViewport = viewportSessions.length > 1;

  useLayoutEffect(() => {
    context.update({
      "document.has-tracks": hasTracks,
      "history.can-undo": canUndoMidi,
      "history.can-redo": canRedoMidi,
      "dialog.debug-open": editorStore.debugVisible,
      "dialog.project-open": editorStore.projectVisible,
      "dialog.settings-open": editorStore.settingsVisible,
      "editor.can-add-viewport": canAddViewport,
      "editor.can-close-viewport": canCloseViewport,
    });
  }, [
    context,
    hasTracks,
    canUndoMidi,
    canRedoMidi,
    editorStore.debugVisible,
    editorStore.projectVisible,
    editorStore.settingsVisible,
    canAddViewport,
    canCloseViewport,
  ]);

  useEffect(() => {
    doc.setHistoryCapacity(settings.history.capacity);
  }, [doc, settings.history.capacity]);

  return <Playback>{children}</Playback>;
}
