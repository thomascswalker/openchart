import type { EditingMode } from "@openchart/views";
import { Difficulty } from "@openchart/views";
import {
  EasyIcon,
  ExpertIcon,
  HardIcon,
  Highway3dIcon,
  LockIcon,
  MediumIcon,
  PianoIcon,
  SnapIcon,
  UnlockIcon,
  VolumeIcon,
} from "../../shared/Icon/Icon";
import { getToolIcon } from "../../shared/Icon/toolIcons";
import type { ToolbarContextState, ToolGroupDef, ToolItemDef } from "./types";

type Icon = ToolItemDef["icon"];

const viewportArgs = (
  view: "piano-roll" | "highway",
  context: ToolbarContextState,
): readonly unknown[] => [
  context.sessionId,
  { view, camera: { tick: context.playbackTick } },
];

const makeViewDef = (
  id: string,
  icon: Icon,
  label: string,
  view: "piano-roll" | "highway",
): ToolItemDef => ({
  id,
  icon,
  label,
  actionId: "editor.update-viewport",
  actionPayload: (context) => viewportArgs(view, context),
  beforeActions: (context) => [
    { id: "editor.focus-viewport", args: [context.sessionId] },
  ],
  isActive: (context) => context.activeView === view,
  isDisabled: (context) => !context.canHostView(view),
});

/** Fixed view and editor controls shared by every editing mode. */
export const ToolbarGroups: ToolGroupDef[] = [
  {
    id: "view-selector",
    items: [
      makeViewDef("piano-roll", PianoIcon, "Piano Roll", "piano-roll"),
      makeViewDef("highway", Highway3dIcon, "Highway", "highway"),
    ],
  },
  {
    id: "general-tools",
    items: [
      {
        id: "lock-cursor",
        icon: UnlockIcon,
        activeIcon: LockIcon,
        label: "Lock/Unlock Cursor",
        actionId: "editor.set-lock-cursor",
        actionPayload: (_context, state) => [!state.lockCursor],
        isActive: (_context, state) => state.lockCursor,
      },
      {
        id: "snap",
        icon: SnapIcon,
        label: "Snap",
        actionId: "editor.set-snap-enabled",
        actionPayload: (_context, state) => [!state.snapEnabled],
        isActive: (_context, state) => state.snapEnabled,
      },
    ],
  },
];

/** Builds button groups directly from the active mode's tool descriptors. */
export function createModeToolbarGroups(mode: EditingMode): ToolGroupDef[] {
  const groups = new Map<string, ToolItemDef[]>();
  for (const tool of mode.tools) {
    if (tool.group === "placement") continue;
    const items = groups.get(tool.group) ?? [];
    items.push({
      id: tool.id,
      icon: getToolIcon(tool.icon),
      label: tool.label,
      actionId: "editor.set-viewport-tools",
      actionPayload: (actionContext, state) => {
        const values = getStateValues(state.toolState);
        const active = Object.is(values[tool.stateKey], tool.value);
        const update: Record<string, unknown> = {
          [tool.stateKey]:
            tool.toggle && active ? tool.toggle.offValue : tool.value,
        };
        if (tool.group === "highway-tools") {
          if (tool.stateKey === "phrase") {
            update.tool = "select";
          } else if (
            tool.stateKey === "tool" &&
            mode.tools.some((descriptor) => descriptor.stateKey === "phrase")
          ) {
            update.phrase = null;
          }
        }
        return [actionContext.sessionId, mode.id, update];
      },
      shortcutActionId: tool.shortcutActionId,
      shortcutVariant: tool.shortcutVariant,
      isActive: (_actionContext, state) =>
        Object.is(getStateValues(state.toolState)[tool.stateKey], tool.value),
    });
    groups.set(tool.group, items);
  }

  const modeGroups: ToolGroupDef[] = [...groups].map(([id, items]) => ({
    id,
    items,
    isVisible: (groupContext) =>
      (id === "highway-tools" && groupContext.activeView === "highway") ||
      (id === "vocal-tools" && groupContext.activeView === "piano-roll") ||
      !["highway-tools", "vocal-tools"].includes(id),
  }));
  if (mode.id === "vocals") {
    const vocalGroup = modeGroups.find((group) => group.id === "vocal-tools");
    if (vocalGroup) {
      vocalGroup.items.push({
        id: "vocal-pitch-feedback",
        icon: VolumeIcon,
        label: "Vocal pitch feedback",
        actionId: "playback.toggle-vocal-pitch-feedback",
        isActive: (_context, state) => state.vocalPitchFeedbackEnabled,
      });
    }
  }
  if (mode.capabilities.requiresDifficulty) {
    modeGroups.push({
      id: "difficulty",
      isVisible: (groupContext) => groupContext.activeView === "highway",
      items: [
        makeDifficultyDef(Difficulty.Easy, EasyIcon, "easy"),
        makeDifficultyDef(Difficulty.Medium, MediumIcon, "medium"),
        makeDifficultyDef(Difficulty.Hard, HardIcon, "hard"),
        makeDifficultyDef(Difficulty.Expert, ExpertIcon, "expert"),
      ],
    });
  }
  return modeGroups;
}

function makeDifficultyDef(
  difficulty: Difficulty,
  icon: Icon,
  label: string,
): ToolItemDef {
  return {
    id: `difficulty-${label.toLowerCase()}`,
    icon,
    label,
    actionId: "editor.update-viewport",
    actionPayload: (context) => [context.sessionId, { difficulty }],
    isActive: (_context, state) => state.session.difficulty === difficulty,
  };
}

export function getStateValues(state: unknown): Record<string, unknown> {
  return typeof state === "object" && state !== null && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : {};
}
