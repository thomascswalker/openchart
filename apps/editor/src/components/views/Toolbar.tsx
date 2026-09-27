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
  NoteIcon,
  PencilIcon,
  PianoIcon,
  VocalsIcon,
} from "../shared/Icon/Icon";
import { VerticalSeparator } from "../shared/Separator";
import {
  useEditor,
  type ViewportKind,
  type ViewportSession,
} from "../../context/EditorContext";
import { SnapDenominators } from "../views/pianoRoll/constants";
import { Button, ToolButton } from "../shared/Button/Button";
import {
  Difficulty,
  InstrumentType,
  SongView,
  type EditablePhraseKind,
} from "@midiedit/views";
import { Fragment } from "react";
import type { HighwayTool } from "./highway";

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
  phraseMode: EditablePhraseKind | null;
  onPhraseModeChange: (mode: EditablePhraseKind | null) => void;
  highwayTool: HighwayTool;
  onHighwayToolChange: (tool: HighwayTool) => void;
}

const Toolbar = ({
  session,
  onViewChange,
  phraseMode,
  onPhraseModeChange,
  highwayTool,
  onHighwayToolChange,
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
      padding="4px"
      gap="4px"
      style={{
        backgroundColor: "var(--primary)",
        borderBottom: "var(--border-primary)",
        scrollBehavior: "auto",
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
            Icon={NoteIcon}
            title="Multi-tool: click to place, drag to select or move, right-drag to edit sustains, right-click to cut, Ctrl-click or both buttons to remove; Shift adds selection, Alt allows sustain overlap"
            ariaLabel="Multi-tool"
            active={highwayTool === "multi"}
            onClick={() =>
              onHighwayToolChange(highwayTool === "multi" ? "select" : "multi")
            }
          />
          <ToolButton
            Icon={CursorIcon}
            title="Select, move, and edit sustains"
            ariaLabel="Select, move, and edit sustains"
            disabled={highwayTool === "multi"}
            active={highwayTool === "select"}
            onClick={() => onHighwayToolChange("select")}
          />
          <ToolButton
            Icon={PencilIcon}
            title="Place notes"
            ariaLabel="Place notes"
            disabled={highwayTool === "multi"}
            active={highwayTool === "place"}
            onClick={() => onHighwayToolChange("place")}
          />
          <ToolButton
            Icon={EraserIcon}
            title="Remove notes"
            ariaLabel="Remove notes"
            disabled={highwayTool === "multi"}
            active={highwayTool === "remove"}
            onClick={() => onHighwayToolChange("remove")}
          />

          <VerticalSeparator />

          <Button
            active={phraseMode === "starpower"}
            onClick={() =>
              onPhraseModeChange(
                phraseMode === "starpower" ? null : "starpower",
              )
            }
          >
            Starpower
          </Button>
          <Button
            active={phraseMode === "solo"}
            onClick={() =>
              onPhraseModeChange(phraseMode === "solo" ? null : "solo")
            }
          >
            Solo
          </Button>

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
