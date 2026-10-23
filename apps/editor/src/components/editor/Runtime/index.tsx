import {
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePlatform, useService } from "../../../platform";
import { useSettings } from "../../../hooks/useApplication";
import { useDocument } from "../../../hooks/useDocument";
import { useViewport } from "../../../hooks/useViewport";
import { DocumentService } from "../../../services/document";
import { EditorStateService } from "../../../services/editor/state";
import { Playback } from "../Playback";
import { profileForInstrument } from "../../views/pianoRoll";

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
  const isVocalsEditing =
    activeSession?.view === "piano-roll" &&
    profileForInstrument(activeSession.instrument).editing === "vocals";
  const isAnyDialogOpen =
    editorStore.projectVisible ||
    editorStore.settingsVisible ||
    editorStore.aboutVisible;

  useLayoutEffect(() => {
    context.update({
      "document.has-tracks": hasTracks,
      "history.can-undo": canUndo,
      "history.can-redo": canRedo,
      "dialog.project-open": editorStore.projectVisible,
      "dialog.settings-open": editorStore.settingsVisible,
      "dialog.about-open": editorStore.aboutVisible,
      "dialog.any-open": isAnyDialogOpen,
      "viewport.active-view": activeView,
      "viewport.vocals-editing": isVocalsEditing,
      "editor.can-add-viewport": canAddViewport,
      "editor.can-close-viewport": canCloseViewport,
    });
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
    isVocalsEditing,
    canAddViewport,
    canCloseViewport,
  ]);

  useEffect(() => {
    doc.setHistoryCapacity(settings.history.capacity);
  }, [doc, settings.history.capacity]);

  return <Playback>{children}</Playback>;
}
