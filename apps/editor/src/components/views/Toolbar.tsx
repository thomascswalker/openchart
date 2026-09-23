import { Button } from "../shared/Button";
import { Section } from "../shared/Section";
import {
  CursorIcon,
  EraserIcon,
  Highway3dIcon,
  MagnetIcon,
  NoteIcon,
  PencilIcon,
  PianoIcon,
} from "../shared/Icon/Icon";
import { VerticalSeparator } from "../shared/Separator";

interface ToolbarProps {
  activeViewId: string;
  onActiveViewChange: (id: string) => void;
}

const Toolbar = ({ activeViewId, onActiveViewChange }: ToolbarProps) => {
  const activeBorder = "solid 1px #ff0000";

  return (
    <Section padding="4px" gap="4px">
      {/* View Selection */}

      <Button
        maxWidth={40}
        maxHeight={40}
        borderRadius={0}
        border={activeViewId === "piano-roll" ? activeBorder : "none"}
        onClick={() => onActiveViewChange("piano-roll")}
      >
        <PianoIcon />
      </Button>
      <Button
        maxWidth={40}
        maxHeight={40}
        borderRadius={0}
        border={activeViewId === "highway" ? activeBorder : "none"}
        onClick={() => onActiveViewChange("highway")}
      >
        <Highway3dIcon />
      </Button>

      <VerticalSeparator />

      {/* Tools */}

      <Button maxWidth={40} maxHeight={40} borderRadius={0} border={"none"}>
        <CursorIcon />
      </Button>
      <Button maxWidth={40} maxHeight={40} borderRadius={0} border={"none"}>
        <EraserIcon />
      </Button>
      <Button maxWidth={40} maxHeight={40} borderRadius={0} border={"none"}>
        <NoteIcon />
      </Button>
      <Button maxWidth={40} maxHeight={40} borderRadius={0} border={"none"}>
        <PencilIcon />
      </Button>
      <Button maxWidth={40} maxHeight={40} borderRadius={0} border={"none"}>
        <MagnetIcon />
      </Button>
    </Section>
  );
};

export default Toolbar;
