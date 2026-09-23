import { Button, type ButtonProps } from "../shared/Button";
import { Section } from "../shared/Section";
import {
  Highway3dIcon,
  MagnetIcon,
  PianoIcon,
  type IconProps,
} from "../shared/Icon/Icon";
import { VerticalSeparator } from "../shared/Separator";
import { useEditor } from "../../context/EditorContext";
import { SnapDenominators } from "../views/pianoRoll/constants";

interface ToolButtonProps extends ButtonProps {
  Icon: (props: Omit<IconProps, "svg">) => React.JSX.Element;
}

const ToolButton = ({ Icon, children, ...rest }: ToolButtonProps) => {
  return (
    <Button maxWidth={40} maxHeight={40} borderRadius={4} {...rest}>
      <Icon />
      {children}
    </Button>
  );
};

interface ToolbarProps {}

const Toolbar = ({}: ToolbarProps) => {
  const {
    activeViewId,
    setActiveViewId,
    snapEnabled,
    setSnapEnabled,
    snapDenominator,
    setSnapDenominator,
  } = useEditor();

  return (
    <Section padding="4px" gap="4px">
      {/* View Selection */}

      <ToolButton
        Icon={PianoIcon}
        active={activeViewId === "piano-roll"}
        onClick={() => setActiveViewId("piano-roll")}
      />
      <ToolButton
        Icon={Highway3dIcon}
        active={activeViewId === "highway"}
        onClick={() => setActiveViewId("highway")}
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
    </Section>
  );
};

export default Toolbar;
