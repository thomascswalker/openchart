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
  SnapIcon,
  MediumIcon,
  PencilIcon,
  PianoIcon,
  VocalsIcon,
  StagepowerIcon,
  SoloIcon,
} from "../shared/Icon/Icon";
import { VerticalSeparator } from "../shared/Separator";
import { Dropdown, DropdownButton } from "../shared/Dropdown";
import type {
  ViewportKind,
  ViewportSession,
} from "../../services/editor/viewports";
import { useDocumentSnapshot } from "../../hooks/useDocumentSnapshot";
import { useViewportSnapshot } from "../../hooks/useViewportSnapshot";
import { runAction } from "../../actions/execute";
import { SnapDenominators } from "../views/pianoRoll/constants";
import { ToolButton } from "../shared/Button";
import { Difficulty, InstrumentType, SongView } from "@openchart/views";
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
}

const Toolbar = ({
  session,
  onViewChange,
  highwayMode,
  onHighwayModeChange,
  drumPlacementKind,
  onDrumPlacementKindChange,
  notePlacementType,
  onNotePlacementTypeChange,
}: ToolbarProps) => {
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
        title="Note type"
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
      <ToolButton
        Icon={PianoIcon}
        active={activeViewId === "piano-roll"}
        onClick={() => handleViewChange("piano-roll")}
      />
      <ToolButton
        Icon={Highway3dIcon}
        active={activeViewId === "highway"}
        onClick={() => handleViewChange("highway")}
      />

      <VerticalSeparator />

      {/* Tools */}
      <DropdownButton
        label="Snap to grid"
        icon={<SnapIcon width={20} height={20} />}
        active={snapEnabled}
        onToggle={(enabled) => runAction("editor.set-snap-enabled", enabled)}
        dropdownDisabled={!snapEnabled}
        dropdownWidth={60}
        value={String(snapDenominator)}
        onChange={(value) =>
          runAction("editor.set-snap-denominator", Number(value))
        }
        options={SNAP_OPTIONS}
      />

      {activeViewId === "highway" && (
        <Fragment>
          {getNoteTypeComponent()}
          <VerticalSeparator />

          <ToolButton
            Icon={CursorIcon}
            title="Select, move, and edit sustains (Q)"
            ariaLabel="Select, move, and edit sustains"
            active={highwayMode === "select"}
            onClick={() => onHighwayModeChange("select")}
          />
          <ToolButton
            Icon={PencilIcon}
            title="Place notes (W)"
            ariaLabel="Place notes"
            active={highwayMode === "place"}
            onClick={() => onHighwayModeChange("place")}
          />
          <ToolButton
            Icon={EraserIcon}
            title="Remove notes (E)"
            ariaLabel="Remove notes"
            active={highwayMode === "remove"}
            onClick={() => onHighwayModeChange("remove")}
          />

          <VerticalSeparator />
          <ToolButton
            active={highwayMode === "stagepower"}
            title="Stagepower phrase (R)"
            ariaLabel="Stagepower phrase"
            onClick={() =>
              onHighwayModeChange(
                highwayMode === "stagepower" ? "select" : "stagepower",
              )
            }
            Icon={StagepowerIcon}
          />
          <ToolButton
            active={highwayMode === "solo"}
            title="Solo phrase (T)"
            ariaLabel="Solo phrase"
            onClick={() =>
              onHighwayModeChange(highwayMode === "solo" ? "select" : "solo")
            }
            Icon={SoloIcon}
          />

          <VerticalSeparator />

          {Object.values(Instruments).map(([instrument, icon]) => (
            <ToolButton
              key={instrument}
              Icon={icon}
              ariaLabel={`Select ${instrument}`}
              disabled={
                !!midiData &&
                !new SongView(midiData).getInstrumentTrackView(instrument)
              }
              active={session.instrument === instrument}
              onClick={() =>
                runAction("editor.update-viewport", session.id, {
                  instrument,
                  trackKey: instrument.toLowerCase().replaceAll(" ", "-"),
                })
              }
            />
          ))}

          <VerticalSeparator />

          {Difficulties.map(([difficulty, icon]) => (
            <ToolButton
              key={difficulty}
              Icon={icon}
              active={session.difficulty === difficulty}
              onClick={() =>
                runAction("editor.update-viewport", session.id, { difficulty })
              }
            ></ToolButton>
          ))}
        </Fragment>
      )}
    </Section>
  );
};

export default Toolbar;
