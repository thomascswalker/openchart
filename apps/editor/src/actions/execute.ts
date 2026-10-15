import Platform from "../platform";
import {
  ActionCancelledError,
  ActionUnavailableError,
} from "../platform/actions";
import { EditorStateService } from "../services/editor/state";

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "The action could not be completed.";
}

export async function runActionAsync<Result = void>(
  id: string,
  ...args: unknown[]
): Promise<Result> {
  const editorState = Platform.services.get<EditorStateService>("editor.state");
  editorState.clearError();
  try {
    return await Platform.actions.executeAction<Result>(id, ...args);
  } catch (error: unknown) {
    if (error instanceof ActionUnavailableError) {
      editorState.setError(
        "This action is not available for the active document.",
      );
    } else if (!(error instanceof ActionCancelledError)) {
      editorState.setError(errorMessage(error));
    }
    throw error;
  }
}

/** Fire-and-forget. Errors are already surfaced via editorState.setError. */
export function runAction(id: string, ...args: unknown[]): void {
  void runActionAsync(id, ...args).catch(() => {});
}
