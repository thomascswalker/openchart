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

const Toolbar = () => {
  return (
    <Section padding="0px" gap="0px">
      <Button maxWidth={40} maxHeight={40} borderRadius={0}>
        <CursorIcon />
      </Button>
      <Button maxWidth={40} maxHeight={40} borderRadius={0}>
        <EraserIcon />
      </Button>
      <Button maxWidth={40} maxHeight={40} borderRadius={0}>
        <NoteIcon />
      </Button>
      <Button maxWidth={40} maxHeight={40} borderRadius={0}>
        <PencilIcon />
      </Button>
      <Button maxWidth={40} maxHeight={40} borderRadius={0}>
        <MagnetIcon />
      </Button>{" "}
      <Button maxWidth={40} maxHeight={40} borderRadius={0}>
        <PianoIcon />
      </Button>{" "}
      <Button maxWidth={40} maxHeight={40} borderRadius={0}>
        <Highway3dIcon />
      </Button>
    </Section>
  );
};

export default Toolbar;
