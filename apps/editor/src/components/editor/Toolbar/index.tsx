import { Fragment } from "react";
import { runAction } from "../../../actions/execute";
import { usePlaybackSelector } from "../../../hooks/usePlayback";
import { useViewport } from "../../../hooks/useViewport";
import Platform from "../../../platform";
import type { EditingService } from "../../../services/editor/editing";
import type { ViewportSession } from "../../../services/editor/viewports";
import { Dropdown, Section } from "../../shared";
import { ToolGroup } from "./ToolGroup";
import {
  createModeToolbarGroups,
  getStateValues,
  ToolbarGroups,
} from "./definitions";
import type { ToolbarContextState, ToolbarEditorState } from "./types";
import { SnapOptions } from "./constants";
import styles from "./toolbar.module.css";

interface ToolbarProps {
  session: ViewportSession;
}

export default function Toolbar({ session }: ToolbarProps) {
  const { snapEnabled, snapDenominator, lockCursor } = useViewport();
  const playbackTick = usePlaybackSelector((snapshot) => snapshot.playbackTick);
  const vocalPitchFeedbackEnabled = usePlaybackSelector(
    (snapshot) => snapshot.isVocalPitchFeedbackEnabled,
  );
  const editing = Platform.services.get<EditingService>("editor.editing");
  const editingSession = editing.getSession(session.id);
  const mode = editingSession?.mode;
  const toolState = editingSession?.getToolState();

  const context: ToolbarContextState = {
    activeView: session.view,
    trackType: session.instrument,
    sessionId: session.id,
    playbackTick,
    canHostView: (view) => editing.canHost(session.id, view),
  };
  const editorState: ToolbarEditorState = {
    session,
    mode,
    toolState,
    snapEnabled,
    snapDenominator,
    lockCursor,
    vocalPitchFeedbackEnabled,
  };
  const modeGroups = editingSession
    ? createModeToolbarGroups(editingSession)
    : [];
  const placementTools =
    editingSession?.getTools().filter((tool) => tool.group === "placement") ??
    [];
  const placementState = getStateValues(toolState);
  const placementStateKey = placementTools[0]?.stateKey;
  const placementValue =
    placementStateKey === undefined
      ? ""
      : String(placementState[placementStateKey] ?? "");
  const placementOptions = placementTools
    .filter((tool) => typeof tool.value === "string")
    .map((tool) => ({
      value: tool.value as string,
      label: placementLabel(tool.value as string, tool.label),
    }));

  const getPlacementDropdown = () => {
    if (placementTools.length === 0 || !placementStateKey || !mode) {
      return null;
    }
    const isVocalMode =
      mode.id === "midi.vocals" && session.view === "piano-roll";
    const isHighway = session.view === "highway";

    if (!isVocalMode && !isHighway) {
      return null;
    }

    const ariaLabel = isVocalMode ? "Vocal note type" : "Note type";
    const disabled = isVocalMode && placementState.phrase !== null;
    return (
      <Dropdown
        aria-label={ariaLabel}
        disabled={disabled}
        value={placementValue}
        onChange={(value) => {
          const selected = placementTools.find(
            (tool) => String(tool.value) === value,
          );
          if (selected) {
            runAction("editor.set-viewport-tools", session.id, mode.id, {
              [placementStateKey]: selected.value,
            });
          }
        }}
        options={placementOptions}
        minWidth={100}
        maxWidth={120}
      />
    );
  };

  return (
    <Section
      className={styles.toolbar}
      backgroundColor="var(--primary)"
      borderBottom="var(--border-primary)"
      padding={2}
      gap="4px"
      flexDirection="row"
      overflowX="auto"
      overflowY="hidden"
      alignItems="center"
    >
      {ToolbarGroups.map((group) => (
        <Fragment key={group.id}>
          <ToolGroup
            group={group}
            context={context}
            editorState={editorState}
          />
          {group.id === "general-tools" && (
            <>
              <Dropdown
                disabled={!snapEnabled}
                aria-label="Snap denominator"
                value={String(snapDenominator)}
                onChange={(value) =>
                  runAction("editor.set-snap-denominator", Number(value))
                }
                minWidth="70px"
                maxWidth="70px"
                options={SnapOptions}
              />
              {getPlacementDropdown()}
              {modeGroups.map((modeGroup) => (
                <ToolGroup
                  key={modeGroup.id}
                  group={modeGroup}
                  context={context}
                  editorState={editorState}
                />
              ))}
            </>
          )}
        </Fragment>
      ))}
    </Section>
  );
}

function placementLabel(value: string, fallback: string): string {
  const labels: Record<string, string> = {
    // Chart placement labels come from the ruleset tool descriptors
    // (`fallback`); only the vocal note kinds are named here.
    pitched: "Pitched",
    percussion: "Percussion",
    pitchless: "Pitchless",
  };
  return labels[value] ?? fallback;
}
