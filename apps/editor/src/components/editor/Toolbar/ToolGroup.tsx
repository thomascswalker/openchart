import { ToolButton } from './ToolButton';
import styles from './toolbar.module.css';
import type {
  ToolGroupDef,
  ToolbarContextState,
  ToolbarEditorState,
} from './types';

interface ToolGroupProps {
  group: ToolGroupDef;
  context: ToolbarContextState;
  editorState: ToolbarEditorState;
}

export function ToolGroup({ group, context, editorState }: ToolGroupProps) {
  if (group.isVisible && !group.isVisible(context)) {
    return null;
  }

  return (
    <div className={styles.toolGroup} role="group" aria-label={group.id}>
      {group.items.map((item) => {
        if (item.isVisible && !item.isVisible(context)) {
          return null;
        }

        return (
          <ToolButton
            key={item.id}
            item={item}
            active={item.isActive?.(context, editorState) ?? false}
            context={context}
            editorState={editorState}
          />
        );
      })}
      <div className={styles.separator} aria-hidden="true" />
    </div>
  );
}
