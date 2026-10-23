import { Section } from "../../shared/Section";
import styles from "./toolbar.module.css";
import {
  CursorIcon,
  EraserIcon,
  EasyIcon,
  ExpertIcon,
  HardIcon,
  Highway3dIcon,
  MediumIcon,
  PencilIcon,
  PianoIcon,
  StagepowerIcon,
  SoloIcon,
  PhraseIcon,
  ActivateIcon,
  VolumeIcon,
  LockIcon,
  UnlockIcon,
  SnapIcon,
} from "../../shared/Icon/Icon";
import { VerticalSeparator } from "../../shared/Separator";
import { Dropdown } from "../../shared/Dropdown";
import type {
  ViewportKind,
  ViewportSession,
} from "../../../services/editor/viewports";
import { useViewportSnapshot } from "../../../hooks/useViewportSnapshot";
import { runAction } from "../../../actions/execute";
import { SnapDenominators } from "../../views/pianoRoll/constants";
import { Button } from "../../shared/Button";
import type { ButtonProps } from "../../shared/Button";
import type { IconProps } from "../../shared/Icon/Icon";
import {
  Difficulty,
  InstrumentType,
  requiresPianoRoll,
  type VocalNoteKind,
  type VocalPhraseKind,
} from "@openchart/views";
import { usePlaybackSelector } from "../../../hooks/usePlayback";
import type { VocalPlacement } from "../../views/pianoRoll";
import { useShortcutResolver } from "../../../input/labels";
import { Fragment } from "react";
import type {
  DrumPlacementKind,
  HighwayMode,
  HighwayNotePlacementType,
} from "../../views/highway";

const Difficulties = [
  [Difficulty.Easy, EasyIcon],
  [Difficulty.Medium, MediumIcon],
  [Difficulty.Hard, HardIcon],
  [Difficulty.Expert, ExpertIcon],
] as const;

const SNAP_OPTIONS = SnapDenominators.map((d) => ({
  value: String(d),
  label: `1/${d}`,
}));

const DRUM_NOTE_TYPE_OPTIONS = [
  { value: "pad", label: "Pad" },
  { value: "cymbal", label: "Cymbal" },
  { value: "kick", label: "Kick" },
];

const VOCAL_NOTE_TYPE_OPTIONS: { value: VocalNoteKind; label: string }[] = [
  { value: "pitched", label: "Pitched" },
  { value: "percussion", label: "Percussion" },
  { value: "pitchless", label: "Pitchless" },
];

// Shortcut hints are appended from the hotkey bindings (src/input).
const VOCAL_PHRASES = [
  ["vocal", PhraseIcon, "Vocal phrase"],
  ["power-window", ActivateIcon, "Power window"],
  ["stagepower", StagepowerIcon, "Stagepower phrase"],
] as const satisfies readonly (readonly [VocalPhraseKind, unknown, string])[];

const GUITAR_NOTE_TYPE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "force-hopo", label: "Force HOPO" },
  { value: "force-strum", label: "Force Strum" },
  { value: "tap", label: "Tap" },
];

interface ToolbarProps {
  session: ViewportSession;
  onViewChange: (view: "piano-roll" | "highway") => void;
  highwayMode: HighwayMode;
  onHighwayModeChange: (mode: HighwayMode) => void;
  drumPlacementKind: DrumPlacementKind;
  onDrumPlacementKindChange: (kind: DrumPlacementKind) => void;
  notePlacementType: HighwayNotePlacementType;
  onNotePlacementTypeChange: (type: HighwayNotePlacementType) => void;
  vocalPlacement: VocalPlacement;
  onVocalPlacementChange: (placement: VocalPlacement) => void;
}

type ToolbarButtonProps = Omit<ButtonProps, "icon"> & {
  icon: (props: Omit<IconProps, "svg">) => React.JSX.Element;
};

const ToolbarButton = ({
  icon: Icon,
  disabled = false,
  ...props
}: ToolbarButtonProps) => (
  <Button
    {...props}
    icon={<Icon width={20} height={20} disabled={disabled} />}
    disabled={disabled}
    width={24}
    height={24}
    minWidth={0}
    minHeight={0}
    maxWidth={24}
    maxHeight={24}
    borderRadius={4}
    border="none"
    padding={0}
  />
);

const Toolbar = ({
  session,
  onViewChange,
  highwayMode,
  onHighwayModeChange,
  drumPlacementKind,
  onDrumPlacementKindChange,
  notePlacementType,
  onNotePlacementTypeChange,
  vocalPlacement,
  onVocalPlacementChange,
}: ToolbarProps) => {
  const isVocalFeedbackEnabled = usePlaybackSelector(
    (snapshot) => snapshot.isVocalPitchFeedbackEnabled,
  );
  const resolveShortcut = useShortcutResolver();
  /** Tooltip text: label plus the current hotkey for the action, if any. */
  const hint = (label: string, action: string, variant?: string): string => {
    const shortcut = resolveShortcut(action, variant);
    return shortcut ? `${label} (${shortcut})` : label;
  };
  const pianoRollOnly = requiresPianoRoll(session.instrument);
  const {
    activeViewId: globalView,
    snapEnabled,
    snapDenominator,
    lockCursor,
  } = useViewportSnapshot();

  const activeViewId = session.view ?? globalView;

  const handleViewChange = (kind: ViewportKind) => {
    onViewChange(kind);
  };

  const getNoteTypeComponent = () => {
    let value = "";
    let onChange: (value: string) => void = () => {};
    let options: {
      value: string;
      label: string;
    }[] = [];
    let disabled = false;
    switch (session.instrument) {
      case InstrumentType.Drums: {
        value = drumPlacementKind;
        onChange = (value: string) =>
          onDrumPlacementKindChange(value as DrumPlacementKind);
        options = DRUM_NOTE_TYPE_OPTIONS;
        break;
      }
      case InstrumentType.Lead:
      case InstrumentType.Groove:
        value = notePlacementType;
        onChange = (value: string) =>
          onNotePlacementTypeChange(value as HighwayNotePlacementType);
        options = GUITAR_NOTE_TYPE_OPTIONS;
        break;
      default:
        disabled = true;
        break;
    }
    return (
      <Dropdown
        aria-label="Note type"
        disabled={disabled}
        value={value}
        onChange={onChange}
        options={options}
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
      overflowY="unset"
      alignItems={"center"}
    >
      {/* View Selection */}
      <ToolbarButton
        icon={PianoIcon}
        aria-label="Piano Roll"
        checked={activeViewId === "piano-roll"}
        onClick={() => handleViewChange("piano-roll")}
      />
      <ToolbarButton
        icon={Highway3dIcon}
        aria-label="Highway"
        disabled={pianoRollOnly}
        checked={activeViewId === "highway"}
        onClick={() => handleViewChange("highway")}
      />

      <VerticalSeparator />
      <ToolbarButton
        icon={lockCursor ? LockIcon : UnlockIcon}
        aria-label="Lock/Unlock Cursor"
        checked={lockCursor}
        onChecked={(state) => runAction("editor.set-lock-cursor", state)}
      />

      {/* Tools */}
      <ToolbarButton
        icon={SnapIcon}
        checked={snapEnabled}
        onChecked={(state) => runAction("editor.set-snap-enabled", state)}
      />
      <Dropdown
        disabled={!snapEnabled}
        value={String(snapDenominator)}
        onChange={(value) =>
          runAction("editor.set-snap-denominator", Number(value))
        }
        minWidth="70px"
        maxWidth="70px"
        options={SNAP_OPTIONS}
      />

      {/* Note Type */}
      {activeViewId === "piano-roll" && pianoRollOnly && (
        <Fragment>
          <VerticalSeparator />
          <Dropdown
            aria-label="Vocal note type"
            disabled={vocalPlacement.phrase !== null}
            value={vocalPlacement.noteKind}
            onChange={(value: string) =>
              onVocalPlacementChange({
                ...vocalPlacement,
                noteKind: value as VocalNoteKind,
              })
            }
            options={VOCAL_NOTE_TYPE_OPTIONS}
            minWidth={100}
            maxWidth={120}
          />
          <VerticalSeparator />
          {VOCAL_PHRASES.map(([phrase, Icon, title]) => (
            <ToolbarButton
              key={phrase}
              icon={Icon}
              aria-label={title}
              title={hint(title, "piano-roll.toggle-vocal-phrase", phrase)}
              checked={vocalPlacement.phrase === phrase}
              onClick={() =>
                onVocalPlacementChange({
                  ...vocalPlacement,
                  phrase: vocalPlacement.phrase === phrase ? null : phrase,
                })
              }
            />
          ))}
          <VerticalSeparator />
          <ToolbarButton
            icon={VolumeIcon}
            aria-label="Vocal pitch feedback"
            checked={isVocalFeedbackEnabled}
            onClick={() => runAction("playback.toggle-vocal-pitch-feedback")}
          />
        </Fragment>
      )}

      {activeViewId === "highway" && (
        <Fragment>
          {getNoteTypeComponent()}
          <VerticalSeparator />

          <ToolbarButton
            icon={CursorIcon}
            aria-label="Select, move, and edit sustains"
            title={hint(
              "Select, move, and edit sustains",
              "highway.set-tool",
              "select",
            )}
            checked={highwayMode === "select"}
            onClick={() => onHighwayModeChange("select")}
          />
          <ToolbarButton
            icon={PencilIcon}
            aria-label="Place notes"
            title={hint("Place notes", "highway.set-tool", "place")}
            checked={highwayMode === "place"}
            onClick={() => onHighwayModeChange("place")}
          />
          <ToolbarButton
            icon={EraserIcon}
            aria-label="Remove notes"
            title={hint("Remove notes", "highway.set-tool", "remove")}
            checked={highwayMode === "remove"}
            onClick={() => onHighwayModeChange("remove")}
          />

          <VerticalSeparator />
          <ToolbarButton
            icon={StagepowerIcon}
            checked={highwayMode === "stagepower"}
            aria-label="Stagepower phrase"
            title={hint(
              "Stagepower phrase",
              "highway.toggle-phrase-tool",
              "stagepower",
            )}
            onClick={() =>
              onHighwayModeChange(
                highwayMode === "stagepower" ? "select" : "stagepower",
              )
            }
          />
          <ToolbarButton
            icon={SoloIcon}
            checked={highwayMode === "solo"}
            aria-label="Solo phrase"
            title={hint("Solo phrase", "highway.toggle-phrase-tool", "solo")}
            onClick={() =>
              onHighwayModeChange(highwayMode === "solo" ? "select" : "solo")
            }
          />

          <VerticalSeparator />

          {Difficulties.map(([difficulty, Icon]) => (
            <ToolbarButton
              key={difficulty}
              icon={Icon}
              checked={session.difficulty === difficulty}
              onClick={() =>
                runAction("editor.update-viewport", session.id, { difficulty })
              }
            />
          ))}
        </Fragment>
      )}
    </Section>
  );
};

export default Toolbar;
