import { Fragment } from "react";
import {
  InstrumentType,
  requiresPianoRoll,
  type VocalNoteKind,
} from "@openchart/views";
import { runAction } from "../../../actions/execute";
import { usePlaybackSelector } from "../../../hooks/usePlayback";
import { useViewport } from "../../../hooks/useViewport";
import type {
  DrumPlacementKind,
  HighwayNotePlacementType,
} from "../../views/highway";
import { Dropdown, Section } from "../../shared";
import type {
  ViewportSession,
  ViewportTools,
} from "../../../services/editor/viewports";
import { ToolbarGroups } from "./definitions";
import { ToolGroup } from "./ToolGroup";
import type { ToolbarContextState, ToolbarEditorState } from "./types";
import styles from "./toolbar.module.css";
import {
  DrumNoteOptions,
  GuitarNoteOptions,
  VocalNoteOptions,
  SnapOptions,
} from "./constants";

interface ToolbarProps {
  session: ViewportSession;
}

export default function Toolbar({ session }: ToolbarProps) {
  const { snapEnabled, snapDenominator, lockCursor } = useViewport();
  const playbackTick = usePlaybackSelector((snapshot) => snapshot.playbackTick);
  const vocalPitchFeedbackEnabled = usePlaybackSelector(
    (snapshot) => snapshot.isVocalPitchFeedbackEnabled,
  );
  const activeView = session.view;
  const pianoRollOnly = requiresPianoRoll(session.instrument);

  const context: ToolbarContextState = {
    activeView,
    trackType: session.instrument,
    sessionId: session.id,
    playbackTick,
  };
  const editorState: ToolbarEditorState = {
    session,
    snapEnabled,
    snapDenominator,
    lockCursor,
    vocalPitchFeedbackEnabled,
  };

  const setNoteType = (args: Partial<ViewportTools>): void => {
    runAction("editor.set-viewport-tools", session.id, args);
  };

  const getHighwayNoteTypeControl = () => {
    if (session.instrument === InstrumentType.Drums) {
      return (
        <Dropdown
          aria-label="Note type"
          value={session.tools.drum}
          onChange={(value: string) =>
            setNoteType({ drum: value as DrumPlacementKind })
          }
          options={DrumNoteOptions}
          minWidth={100}
          maxWidth={120}
        />
      );
    }
    if (
      session.instrument === InstrumentType.Lead ||
      session.instrument === InstrumentType.Groove
    ) {
      return (
        <Dropdown
          aria-label="Note type"
          value={session.tools.guitar}
          onChange={(value: string) =>
            setNoteType({ guitar: value as HighwayNotePlacementType })
          }
          options={GuitarNoteOptions}
          minWidth={100}
          maxWidth={120}
        />
      );
    }
    return (
      <Dropdown
        aria-label="Note type"
        disabled
        value=""
        onChange={() => {}}
        options={[]}
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
          {group.id === "vocal-tools" &&
            activeView === "piano-roll" &&
            pianoRollOnly && (
              <Dropdown
                aria-label="Vocal note type"
                disabled={session.tools.vocal.phrase !== null}
                value={session.tools.vocal.noteKind}
                onChange={(value: string) =>
                  setNoteType({
                    vocal: {
                      ...session.tools.vocal,
                      noteKind: value as VocalNoteKind,
                    },
                  })
                }
                options={VocalNoteOptions}
                minWidth={100}
                maxWidth={120}
              />
            )}
          {group.id === "highway-tools" &&
            activeView === "highway" &&
            getHighwayNoteTypeControl()}
          <ToolGroup
            group={group}
            context={context}
            editorState={editorState}
          />
          {group.id === "general-tools" && (
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
          )}
        </Fragment>
      ))}
    </Section>
  );
}
