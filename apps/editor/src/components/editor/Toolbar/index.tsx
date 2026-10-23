import {
  ActivateIcon,
  Button,
  CursorIcon,
  Dropdown,
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
  Section,
  SnapIcon,
  SoloIcon,
  StagepowerIcon,
  UnlockIcon,
  VerticalSeparator,
  VolumeIcon,
  type IconProps,
} from "../../shared";
import styles from "./toolbar.module.css";
import type {
  HighwayToolMode,
  ViewportSession,
  ViewportTools,
} from "../../../services/editor/viewports";
import { useViewport } from "../../../hooks/useViewport";
import { runAction } from "../../../actions/execute";
import { SnapDenominators } from "../../views/pianoRoll/constants";
import {
  Difficulty,
  InstrumentType,
  requiresPianoRoll,
  type VocalNoteKind,
  type VocalPhraseKind,
} from "@openchart/views";
import { usePlaybackSelector } from "../../../hooks/usePlayback";
import { useShortcutResolver } from "../../../input/labels";
import { Fragment } from "react";
import type {
  DrumPlacementKind,
  HighwayNotePlacementType,
} from "../../views/highway";
import type { ButtonProps } from "../../shared/Button";
import Platform from "../../../platform";
import type { PlaybackService } from "../../../services/playback";

const Difficulties = [
  [Difficulty.Easy, EasyIcon],
  [Difficulty.Medium, MediumIcon],
  [Difficulty.Hard, HardIcon],
  [Difficulty.Expert, ExpertIcon],
] as const;

const SnapOptions = SnapDenominators.map((d) => ({
  value: String(d),
  label: `1/${d}`,
}));

const DrumNoteOptions = [
  { value: "pad", label: "Pad" },
  { value: "cymbal", label: "Cymbal" },
  { value: "kick", label: "Kick" },
];

const VocalNoteOptions: { value: VocalNoteKind; label: string }[] = [
  { value: "pitched", label: "Pitched" },
  { value: "percussion", label: "Percussion" },
  { value: "pitchless", label: "Pitchless" },
];

// Shortcut hints are appended from the hotkey bindings (src/input).
const VocalPhrases = [
  ["vocal", PhraseIcon, "Vocal phrase"],
  ["power-window", ActivateIcon, "Power window"],
  ["stagepower", StagepowerIcon, "Stagepower phrase"],
] as const satisfies readonly (readonly [VocalPhraseKind, unknown, string])[];

const GuitarNoteOptions = [
  { value: "normal", label: "Normal" },
  { value: "force-hopo", label: "Force HOPO" },
  { value: "force-strum", label: "Force Strum" },
  { value: "tap", label: "Tap" },
];

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

interface ToolbarProps {
  session: ViewportSession;
}

const Toolbar = ({ session }: ToolbarProps) => {
  const {
    mode: toolMode,
    drum: drumType,
    guitar: guitarType,
    vocal: vocalType,
  } = session.tools;
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
  } = useViewport();

  const activeViewId = session.view ?? globalView;

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
        value = drumType;
        onChange = (value: string) =>
          setNoteType({
            drum: value as DrumPlacementKind,
          });
        options = DrumNoteOptions;
        break;
      }
      case InstrumentType.Lead:
      case InstrumentType.Groove:
        value = guitarType;
        onChange = (value: string) =>
          setNoteType({
            guitar: value as HighwayNotePlacementType,
          });
        options = GuitarNoteOptions;
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

  const setView = (view: ViewportSession["view"]) => {
    runAction("editor.focus-viewport", session.id);
    const { playbackTick } = Platform.services
      .get<PlaybackService>("playback")
      .getSnapshot();
    runAction("editor.update-viewport", session.id, {
      view,
      camera: { tick: playbackTick },
    });
  };

  const setNoteType = (args: Partial<ViewportTools>) => {
    runAction("editor.set-viewport-tools", session.id, args);
  };

  const setToolMode = (mode: HighwayToolMode) => {
    runAction("highway.set-tool", toolMode !== mode ? mode : "select");
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
        onClick={() => setView("piano-roll")}
      />
      <ToolbarButton
        icon={Highway3dIcon}
        aria-label="Highway"
        disabled={pianoRollOnly}
        checked={activeViewId === "highway"}
        onClick={() => setView("highway")}
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
        options={SnapOptions}
      />

      {/* Note Type */}
      {activeViewId === "piano-roll" && pianoRollOnly && (
        <Fragment>
          <VerticalSeparator />
          <Dropdown
            aria-label="Vocal note type"
            disabled={vocalType.phrase !== null}
            value={vocalType.noteKind}
            onChange={(value: string) =>
              setNoteType({
                vocal: {
                  ...vocalType,
                  noteKind: value as VocalNoteKind,
                },
              })
            }
            options={VocalNoteOptions}
            minWidth={100}
            maxWidth={120}
          />
          <VerticalSeparator />
          {VocalPhrases.map(([phrase, Icon, title]) => (
            <ToolbarButton
              key={phrase}
              icon={Icon}
              aria-label={title}
              title={hint(title, "piano-roll.toggle-vocal-phrase", phrase)}
              checked={vocalType.phrase === phrase}
              onClick={() =>
                setNoteType({
                  vocal: {
                    ...vocalType,
                    phrase: vocalType.phrase === phrase ? null : phrase,
                  },
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
            checked={toolMode === "select"}
            onClick={() => setToolMode("select")}
          />
          <ToolbarButton
            icon={PencilIcon}
            aria-label="Place notes"
            title={hint("Place notes", "highway.set-tool", "place")}
            checked={toolMode === "place"}
            onClick={() => setToolMode("place")}
          />
          <ToolbarButton
            icon={EraserIcon}
            aria-label="Remove notes"
            title={hint("Remove notes", "highway.set-tool", "remove")}
            checked={toolMode === "remove"}
            onClick={() => setToolMode("remove")}
          />

          <VerticalSeparator />
          <ToolbarButton
            icon={StagepowerIcon}
            checked={toolMode === "stagepower"}
            aria-label="Stagepower phrase"
            title={hint(
              "Stagepower phrase",
              "highway.toggle-phrase-tool",
              "stagepower",
            )}
            onClick={() => setToolMode("stagepower")}
          />
          <ToolbarButton
            icon={SoloIcon}
            checked={toolMode === "solo"}
            aria-label="Solo phrase"
            title={hint("Solo phrase", "highway.toggle-phrase-tool", "solo")}
            onClick={() => setToolMode("solo")}
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
