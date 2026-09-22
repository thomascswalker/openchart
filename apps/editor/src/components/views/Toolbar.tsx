import { Button } from "../shared/Button";
import { Section } from "../shared/Section";
import {
  CursorIcon,
  EraserIcon,
  NoteIcon,
  PencilIcon,
} from "../shared/Icon/Icon";

const Toolbar = () => {
  return (
    <Section padding="0" gap="0">
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
    </Section>
  );
};

export default Toolbar;
