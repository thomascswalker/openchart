import { useSyncExternalStore } from "react";
import Platform from "../platform";
import { AudioService } from "../services/audio";
import { EditorStateService } from "../services/editor/state";
import { useDocumentSnapshot } from "./useDocumentSnapshot";

export function useEditorState() {
  const editorState = Platform.services.get<EditorStateService>("editor.state");
  const editor = useSyncExternalStore(
    editorState.subscribe,
    editorState.getSnapshot,
    editorState.getSnapshot,
  );
  const audioService = Platform.services.get<AudioService>("audio");
  const audio = useSyncExternalStore(
    audioService.subscribe,
    audioService.getSnapshot,
    audioService.getSnapshot,
  );
  const { isDirty } = useDocumentSnapshot();

  return {
    ...editor,
    isDirty,
    audioDirectoryName: audio.audioDirectoryName,
    audioDirectorySupported: audio.audioDirectorySupported,
  };
}
