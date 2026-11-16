import Platform from '../platform';
import { runAction } from '../platform/actions/execute.ts';
import type { EditorClipboardService } from '../platform/services/editor/clipboard.ts';
import type { Binding } from './define.ts';

/**
 * Runs an action for a hotkey. An unavailable action is a silent no-op (not an
 * error banner), exactly like the old Shell key handler.
 */
export function dispatchAction(
  action: string,
  args: readonly unknown[] = [],
): void {
  // Availability of clipboard actions depends on the active view's selection.
  Platform.services.get<EditorClipboardService>('editor.clipboard').sync();
  if (!Platform.actions.isAvailable(action)) {
    return;
  }
  runAction(action, ...args);
}

export function dispatchBinding(binding: Pick<Binding, 'action' | 'args'>) {
  dispatchAction(binding.action, binding.args);
}
