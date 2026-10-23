import { Difficulty, requiresPianoRoll } from "@openchart/views";
import {
  ActivateIcon,
  CursorIcon,
  EasyIcon,
  EraserIcon,
  ExpertIcon,
  HardIcon,
  Highway3dIcon,
  LockIcon,
  MediumIcon,
  PencilIcon,
  PhraseIcon,
  PianoIcon,
  SnapIcon,
  SoloIcon,
  StagepowerIcon,
  UnlockIcon,
  VolumeIcon,
} from "../../shared";
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
  isDisabled: (context) =>
    view === "highway" && requiresPianoRoll(context.trackType),
});

const makeHighwayToolDef = (
  id: string,
  icon: Icon,
  label: string,
  mode: "select" | "place" | "remove" | "stagepower" | "solo",
  shortcutActionId = "highway.set-tool",
): ToolItemDef => ({
  id,
  icon,
  label,
  actionId: "highway.set-tool",
  actionPayload: (_context, state) => [
    state.session.tools.mode === mode ? "select" : mode,
  ],
  shortcutActionId,
  shortcutVariant: mode,
  isActive: (_context, state) => state.session.tools.mode === mode,
});

const makeDifficultyDef = (
  difficulty: Difficulty,
  icon: Icon,
  label: string,
) => {
  return {
    id: `difficulty-${label.toLowerCase()}`,
    icon,
    label,
    actionId: "editor.update-viewport",
    actionPayload: (context) => [context.sessionId, { difficulty }],
    isActive: (_context, state) => state.session.difficulty === difficulty,
  } as ToolItemDef;
};

const makeVocalToolDef = (
  phrase: "vocal" | "power-window" | "stagepower",
  icon: Icon,
  label: string,
): ToolItemDef => ({
  id: `vocal-phrase-${phrase}`,
  icon,
  label,
  actionId: "editor.set-viewport-tools",
  actionPayload: (context, state) => [
    context.sessionId,
    {
      vocal: {
        ...state.session.tools.vocal,
        phrase: state.session.tools.vocal.phrase === phrase ? null : phrase,
      },
    },
  ],
  shortcutActionId: "piano-roll.toggle-vocal-phrase",
  shortcutVariant: phrase,
  isActive: (_context, state) => state.session.tools.vocal.phrase === phrase,
});

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
  {
    id: "vocal-tools",
    isVisible: (context) =>
      context.activeView === "piano-roll" &&
      requiresPianoRoll(context.trackType),
    items: [
      makeVocalToolDef("vocal", PhraseIcon, "Vocal phrase"),
      makeVocalToolDef("power-window", ActivateIcon, "Power window"),
      makeVocalToolDef("stagepower", StagepowerIcon, "Stagepower phrase"),
      {
        id: "vocal-pitch-feedback",
        icon: VolumeIcon,
        label: "Vocal pitch feedback",
        actionId: "playback.toggle-vocal-pitch-feedback",
        isActive: (_context, state) => state.vocalPitchFeedbackEnabled,
      },
    ],
  },
  {
    id: "highway-tools",
    isVisible: (context) => context.activeView === "highway",
    items: [
      makeHighwayToolDef(
        "select",
        CursorIcon,
        "Select, move, and edit sustains",
        "select",
      ),
      makeHighwayToolDef("place", PencilIcon, "Place notes", "place"),
      makeHighwayToolDef("remove", EraserIcon, "Remove notes", "remove"),
      makeHighwayToolDef(
        "stagepower",
        StagepowerIcon,
        "Stagepower phrase",
        "stagepower",
        "highway.toggle-phrase-tool",
      ),
      makeHighwayToolDef(
        "solo",
        SoloIcon,
        "Solo phrase",
        "solo",
        "highway.toggle-phrase-tool",
      ),
    ],
  },
  {
    id: "difficulty",
    isVisible: (context) => context.activeView === "highway",
    items: [
      makeDifficultyDef(Difficulty.Easy, EasyIcon, "easy"),
      makeDifficultyDef(Difficulty.Medium, MediumIcon, "medium"),
      makeDifficultyDef(Difficulty.Hard, HardIcon, "hard"),
      makeDifficultyDef(Difficulty.Expert, ExpertIcon, "expert"),
    ],
  },
];
