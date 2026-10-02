import { Section } from "../shared/Section";
import {
  BassIcon,
  CursorIcon,
  DrumsIcon,
  EraserIcon,
  EasyIcon,
  ExpertIcon,
  GuitarIcon,
  HardIcon,
  Highway3dIcon,
  MagnetIcon,
  MediumIcon,
  PencilIcon,
  PianoIcon,
  VocalsIcon,
  StagepowerIcon,
  SoloIcon,
} from "../shared/Icon/Icon";
import { VerticalSeparator } from "../shared/Separator";
import { DropdownButton } from "../shared/Dropdown";
import type {
  ViewportKind,
  ViewportSession,
} from "../../services/editor/viewports";
import { useDocumentSnapshot } from "../../hooks/useDocumentSnapshot";
import { useViewportSnapshot } from "../../hooks/useViewportSnapshot";
import { executeEditorAction } from "../../actions/execute";
import { SnapDenominators } from "../views/pianoRoll/constants";
import { ToolButton } from "../shared/Button/Button";
import { Difficulty, InstrumentType, SongView } from "@midiedit/views";
import { Fragment } from "react";
import type { DrumPlacementKind, HighwayMode } from "./highway";

const Instruments = [
  [InstrumentType.Lead, GuitarIcon],
  [InstrumentType.Groove, BassIcon],
  [InstrumentType.Drums, DrumsIcon],
  [InstrumentType.Vocals, VocalsIcon],
] as const;

const Difficulties = [
  [Difficulty.Easy, EasyIcon],
  [Difficulty.Medium, MediumIcon],
  [Difficulty.Hard, HardIcon],
  [Difficulty.Expert, ExpertIcon],
] as const;

interface ToolbarProps {
  session: ViewportSession;
  onViewChange: (view: "piano-roll" | "highway") => void;
  highwayMode: HighwayMode;
  onHighwayModeChange: (mode: HighwayMode) => void;
  drumPlacementKind: DrumPlacementKind;
  onDrumPlacementKindChange: (kind: DrumPlacementKind) => void;
}

const Toolbar = ({
  session,
  onViewChange,
  highwayMode,
  onHighwayModeChange,
  drumPlacementKind,
  onDrumPlacementKindChange,
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

  return (
    <Section
      className="viewport-panel__toolbar"
      style={{
        backgroundColor: "var(--primary)",
        borderBottom: "var(--border-primary)",
        scrollBehavior: "auto",
        padding: "4px",
        gap: "4px",
      }}
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
        ariaLabel="Toggle snap to grid"
        icon={<MagnetIcon />}
        active={snapEnabled}
        onToggle={(enabled) =>
          void executeEditorAction("editor.set-snap-enabled", enabled).catch(
            () => {},
          )
        }
        dropdownDisabled={!snapEnabled}
        dropdownWidth={60}
        value={String(snapDenominator)}
        onChange={(value) =>
          void executeEditorAction(
            "editor.set-snap-denominator",
            Number(value),
          ).catch(() => {})
        }
        options={SnapDenominators.map((denominator) => ({
          value: String(denominator),
          label: `1/${denominator}`,
        }))}
      />

      {activeViewId === "highway" && (
        <Fragment>
          {session.instrument === InstrumentType.Drums && (
            <select
              aria-label="Drum note type"
              title="Drum note type"
              value={drumPlacementKind}
              onChange={(event) =>
                onDrumPlacementKindChange(
                  event.currentTarget.value as DrumPlacementKind,
                )
              }
            >
              <option value="pad">Pad</option>
              <option value="cymbal">Cymbal</option>
              <option value="kick">Kick</option>
            </select>
          )}
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
              disabled={
                !!midiData &&
                !new SongView(midiData).getInstrumentTrackView(instrument)
              }
              active={session.instrument === instrument}
              onClick={() => {
                void executeEditorAction("editor.update-viewport", session.id, {
                  instrument,
                  trackKey: instrument.toLowerCase().replaceAll(" ", "-"),
                }).catch(() => {});
              }}
            />
          ))}

          <VerticalSeparator />

          {Difficulties.map(([difficulty, icon]) => (
            <ToolButton
              key={difficulty}
              Icon={icon}
              active={session.difficulty === difficulty}
              onClick={() =>
                void executeEditorAction("editor.update-viewport", session.id, {
                  difficulty,
                }).catch(() => {})
              }
            ></ToolButton>
          ))}
        </Fragment>
      )}
    </Section>
  );
};

export default Toolbar;
