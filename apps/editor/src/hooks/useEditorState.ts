import { useSyncExternalStore } from "react";
import Platform from "../platform";
import { EditorStateService } from "../services/editor/state";
import { useDocumentSnapshot } from "./useDocumentSnapshot";

export function useEditorState() {
  const editorState = Platform.services.get<EditorStateService>("editor.state");
  const editor = useSyncExternalStore(
    editorState.subscribe,
    editorState.getSnapshot,
    editorState.getSnapshot,
  );
  const { isDirty } = useDocumentSnapshot();

  return {
    ...editor,
    isDirty,
  };
}
