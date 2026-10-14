import { Section } from "../shared/Section";
import {
  BassIcon,
  CursorIcon,
  DrumsIcon,
  EraserIcon,
  EasyIcon,
  ExpertIcon,
  GuitarIcon,
  FourpadIcon,
  FivepadIcon,
  HardIcon,
  Highway3dIcon,
  MediumIcon,
  PencilIcon,
  PianoIcon,
  VocalsIcon,
  StagepowerIcon,
  SoloIcon,
  PhraseIcon,
  ActivateIcon,
  VolumeIcon,
} from "../shared/Icon/Icon";
import { VerticalSeparator } from "../shared/Separator";
import { Dropdown } from "../shared/Dropdown";
import type {
  ViewportKind,
  ViewportSession,
} from "../../services/editor/viewports";
import { useDocumentSnapshot } from "../../hooks/useDocumentSnapshot";
import { useViewportSnapshot } from "../../hooks/useViewportSnapshot";
import { runAction } from "../../actions/execute";
import { SnapDenominators } from "../views/pianoRoll/constants";
import { Button, Checkbox } from "../shared/Button";
import type { ButtonProps } from "../shared/Button";
import type { IconProps } from "../shared/Icon/Icon";
import {
  Difficulty,
  InstrumentType,
  requiresPianoRoll,
  SongView,
  type VocalNoteKind,
  type VocalPhraseKind,
} from "@openchart/views";
import { usePlaybackSelector } from "../../hooks/usePlayback";
import type { VocalPlacement } from "./pianoRoll";
import { Fragment } from "react";
import type {
  DrumPlacementKind,
  HighwayMode,
  HighwayNotePlacementType,
} from "./highway";

const Instruments = [
  [InstrumentType.Lead, GuitarIcon],
  [InstrumentType.Groove, BassIcon],
  [InstrumentType.Drums, DrumsIcon],
  [InstrumentType.Vocals, VocalsIcon],
  [InstrumentType.FourPad, FourpadIcon],
  [InstrumentType.FivePad, FivepadIcon],
] as const;

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

const VOCAL_PHRASES = [
  ["vocal", PhraseIcon, "Vocal phrase (T)"],
  ["power-window", ActivateIcon, "Power window (Y)"],
  ["stagepower", StagepowerIcon, "Stagepower phrase (R)"],
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
  const pianoRollOnly = requiresPianoRoll(session.instrument);
  const { midiData } = useDocumentSnapshot();
  const {
    activeViewId: globalView,
    snapEnabled,
    snapDenominator,
  } = useViewportSnapshot();

  const activeViewId = session.view ?? globalView;

  const handleViewChange = (kind: ViewportKind) => {
    onViewChange(kind);
  };

  const getNoteTypeComponent = () => {
    let value = "";
    let onChange = (_: string) => {};
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

      {/* Tools */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          maxWidth: "95px",
          gap: 8,
        }}
      >
        <Checkbox
          checked={snapEnabled}
          onChange={(event) =>
            runAction("editor.set-snap-enabled", Boolean(event.target.checked))
          }
        />
        <Dropdown
          disabled={!snapEnabled}
          value={String(snapDenominator)}
          onChange={(value) =>
            runAction("editor.set-snap-denominator", Number(value))
          }
          minWidth="70px"
          options={SNAP_OPTIONS}
        />
      </div>

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
              aria-label={title.replace(/ \(.\)$/, "")}
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
            checked={highwayMode === "select"}
            onClick={() => onHighwayModeChange("select")}
          />
          <ToolbarButton
            icon={PencilIcon}
            aria-label="Place notes"
            checked={highwayMode === "place"}
            onClick={() => onHighwayModeChange("place")}
          />
          <ToolbarButton
            icon={EraserIcon}
            aria-label="Remove notes"
            checked={highwayMode === "remove"}
            onClick={() => onHighwayModeChange("remove")}
          />

          <VerticalSeparator />
          <ToolbarButton
            icon={StagepowerIcon}
            checked={highwayMode === "stagepower"}
            aria-label="Stagepower phrase"
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
            onClick={() =>
              onHighwayModeChange(highwayMode === "solo" ? "select" : "solo")
            }
          />

          <VerticalSeparator />

          {Object.values(Instruments).map(([instrument, Icon]) => (
            <ToolbarButton
              key={instrument}
              icon={Icon}
              aria-label={`Select ${instrument}`}
              disabled={
                !!midiData &&
                !new SongView(midiData).getInstrumentTrackView(instrument)
              }
              checked={session.instrument === instrument}
              onClick={() =>
                runAction("editor.update-viewport", session.id, {
                  instrument,
                  trackKey: instrument.toLowerCase().replaceAll(" ", "-"),
                })
              }
            />
          ))}

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
