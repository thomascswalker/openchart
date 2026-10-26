import {
  ActivateIcon,
  BassIcon,
  DrumsIcon,
  EraserIcon,
  FourpadIcon,
  NoteIcon,
  PencilIcon,
  PhraseIcon,
  SoloIcon,
  StagepowerIcon,
  CursorIcon,
} from "./Icon";

const toolIcons = {
  cursor: CursorIcon,
  pencil: PencilIcon,
  eraser: EraserIcon,
  stagepower: StagepowerIcon,
  solo: SoloIcon,
  vocal: PhraseIcon,
  "power-window": ActivateIcon,
  pad: FourpadIcon,
  cymbal: DrumsIcon,
  kick: BassIcon,
  note: NoteIcon,
  pitched: NoteIcon,
  pitchless: NoteIcon,
  percussion: DrumsIcon,
};

/** Resolves a mode-provided tool icon key, falling back to the note icon. */
export function getToolIcon(key: string) {
  return toolIcons[key as keyof typeof toolIcons] ?? NoteIcon;
}
