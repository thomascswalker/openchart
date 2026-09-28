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
import {
  useEditor,
  type ViewportKind,
  type ViewportSession,
} from "../../context/EditorContext";
import { SnapDenominators } from "../views/pianoRoll/constants";
import { ToolButton } from "../shared/Button/Button";
import { Difficulty, InstrumentType, SongView } from "@midiedit/views";
import { Fragment } from "react";
import type { HighwayMode } from "./highway";

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
}

const Toolbar = ({
  session,
  onViewChange,
  highwayMode,
  onHighwayModeChange,
}: ToolbarProps) => {
  const {
    midiData,
    activeViewId: globalView,
    snapEnabled,
    setSnapEnabled,
    snapDenominator,
    setSnapDenominator,
    updateViewport,
  } = useEditor();
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
      <ToolButton
        Icon={MagnetIcon}
        active={snapEnabled}
        onClick={() => setSnapEnabled(!snapEnabled)}
      />
      <select
        value={snapDenominator}
        disabled={!snapEnabled}
        onChange={(event) => {
          setSnapDenominator(Number(event.target.value));
        }}
        style={{ maxWidth: "60px" }}
      >
        {SnapDenominators.map((denominator) => (
          <option key={denominator} value={denominator}>
            1/{denominator}
          </option>
        ))}
      </select>

      {activeViewId === "highway" && (
        <Fragment>
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
              onClick={() =>
                updateViewport(session.id, {
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
              onClick={() => updateViewport(session.id, { difficulty })}
            ></ToolButton>
          ))}
        </Fragment>
      )}
    </Section>
  );
};

export default Toolbar;
