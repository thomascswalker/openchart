import type { ComponentType } from "react";
import type { EditingMode } from "@openchart/views";
import type { ViewportSession } from "../../../services/editor/viewports";

export interface ToolbarContextState {
  activeView: ViewportSession["view"];
  trackType: string;
  sessionId: string;
  playbackTick: number;
  canHostView: (view: ViewportSession["view"]) => boolean;
}

export interface ToolbarEditorState {
  session: ViewportSession;
  mode?: EditingMode;
  toolState: unknown;
  snapEnabled: boolean;
  snapDenominator: number;
  lockCursor: boolean;
  vocalPitchFeedbackEnabled: boolean;
}

export type ToolIcon = ComponentType<{
  width?: number;
  height?: number;
  disabled?: boolean;
}>;

export interface ToolAction {
  id: string;
  args: readonly unknown[];
}

export type ToolActionPayload = (
  context: ToolbarContextState,
  editorState: ToolbarEditorState,
) => readonly unknown[];

export interface ToolItemDef {
  id: string;
  icon: ToolIcon;
  activeIcon?: ToolIcon;
  label: string;
  actionId: string;
  actionPayload?: ToolActionPayload;
  shortcutActionId?: string;
  shortcutVariant?: string;
  isActive?: (
    context: ToolbarContextState,
    editorState: ToolbarEditorState,
  ) => boolean;
  isVisible?: (context: ToolbarContextState) => boolean;
  isDisabled?: (
    context: ToolbarContextState,
    editorState: ToolbarEditorState,
  ) => boolean;
  beforeActions?: (
    context: ToolbarContextState,
    editorState: ToolbarEditorState,
  ) => readonly ToolAction[];
}

export interface ToolGroupDef {
  id: string;
  items: ToolItemDef[];
  isVisible?: (context: ToolbarContextState) => boolean;
}
