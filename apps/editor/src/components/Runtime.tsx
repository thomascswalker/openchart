import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePlatform, useService } from "../platform";
import { runAction } from "../actions/execute";
import { useApplicationSettings } from "../hooks/useApplicationSettings";
import { useDocumentSnapshot } from "../hooks/useDocumentSnapshot";
import { useViewportSnapshot } from "../hooks/useViewportSnapshot";
import { AudioService } from "../services/audio";
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

  const audioFileRef = useRef<HTMLInputElement>(null);
  const audio = useService<AudioService>("audio");
  const doc = useService<DocumentService>("document");
  const editorState = useService<EditorStateService>("editor.state");

  const audioStore = useSyncExternalStore(
    audio.subscribe,
    audio.getSnapshot,
    audio.getSnapshot,
  );
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
      "audio.single-track-mode": !settings.audio.multitrack,
      "audio.directory-picker-supported": audioStore.audioDirectorySupported,
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
    settings.audio.multitrack,
    audioStore.audioDirectorySupported,
    editorStore.debugVisible,
    editorStore.projectVisible,
    editorStore.settingsVisible,
    canAddViewport,
    canCloseViewport,
  ]);

  useEffect(() => {
    audio.setFileInputRef(audioFileRef);
  }, [audio]);

  useEffect(() => {
    doc.setHistoryCapacity(settings.history.capacity);
  }, [doc, settings.history.capacity]);

  const discover = useEffectEvent(() => void audio.discoverAudio(settings));

  useEffect(() => {
    discover();
  }, [settings.audio.multitrack, settings.audio.rootPath, settings.discovery]);

  const audioFileInput = (
    <input
      ref={audioFileRef}
      type="file"
      accept=".wav"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) {
          runAction("audio.load-file", file);
        }
      }}
      hidden
      aria-hidden="true"
    />
  );

  return (
    <Playback>
      {children}
      {audioFileInput}
    </Playback>
  );
}
