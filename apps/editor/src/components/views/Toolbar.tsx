import { Section } from "../shared/Section";
import {
  EasyIcon,
  ExpertIcon,
  HardIcon,
  Highway3dIcon,
  MagnetIcon,
  MediumIcon,
  PianoIcon,
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

const HighwayInstruments = [
  InstrumentType.Lead,
  InstrumentType.Bass,
  InstrumentType.Drums,
  InstrumentType.Vocals,
];

interface ToolbarProps {
  session: ViewportSession;
  onViewChange: (view: "piano-roll" | "highway") => void;
}

const Toolbar = ({ session, onViewChange }: ToolbarProps) => {
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
    <Section padding="4px" gap="4px">
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

          {Object.values(HighwayInstruments).map((instrument) => (
            <ToolButton
              key={instrument}
              Icon={PianoIcon}
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
            >
              {instrument[0]}
            </ToolButton>
          ))}

          <VerticalSeparator />

          {(
            [
              [Difficulty.Easy, EasyIcon],
              [Difficulty.Medium, MediumIcon],
              [Difficulty.Hard, HardIcon],
              [Difficulty.Expert, ExpertIcon],
            ] as const
          ).map(([difficulty, icon]) => (
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
