import { runAction } from "../../../actions/execute";
import type {
  ToolbarContextState,
  ToolbarEditorState,
  ToolItemDef,
} from "./types";
import { Button } from "../../shared";

interface ToolButtonProps {
  item: ToolItemDef;
  active: boolean;
  context: ToolbarContextState;
  editorState: ToolbarEditorState;
}

export function ToolButton({
  item,
  active,
  context,
  editorState,
}: ToolButtonProps) {
  const Icon = active && item.activeIcon ? item.activeIcon : item.icon;

  const disabled = item.isDisabled?.(context, editorState) ?? false;
  const isActive = item.isActive?.(context, editorState) ?? false;

  const handleClick = (): void => {
    for (const action of item.beforeActions?.(context, editorState) ?? []) {
      runAction(action.id, ...action.args);
    }
    const args = item.actionPayload?.(context, editorState) ?? [];
    runAction(item.actionId, ...args);
  };

  return (
    <Button
      icon={<Icon width={20} height={20} disabled={disabled} />}
      disabled={disabled}
      checked={isActive}
      width={24}
      height={24}
      minWidth={0}
      minHeight={0}
      maxWidth={24}
      maxHeight={24}
      borderRadius={4}
      border="none"
      padding={0}
      onClick={handleClick}
      aria-label={item.label}
      aria-pressed={active}
    />
  );
}
