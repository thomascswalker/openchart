import { globalBindings, pianoRollBindings } from "../../../../input";
import { useHotkeys } from "../../../../input/lib";
import { PianoRollView } from "../index";
import type { AnyChartView } from "../../ChartViews";

type Handler = (view: PianoRollView, args: readonly unknown[]) => void;

/**
 * The story mounts a bare view without the editor's action platform, so it maps
 * the same bindings the app uses onto view methods directly. Chords still come
 * from `src/input`, so remapping a hotkey there changes the story too.
 */
const HANDLERS: Record<string, Handler> = {
  "piano-roll.transpose-selection": (view, [semitones]) =>
    view.transposeSelection(semitones as number),
  "piano-roll.move-selection": (view, [direction]) =>
    view.moveSelection(direction as -1 | 1),
  "piano-roll.select-all": (view) => view.selectAll(),
  "piano-roll.clear-selection": (view) => view.clearSelection(),
  "piano-roll.focus-selection": (view) => view.focusSelection(),
  "editor.delete-selection": (view) => view.deleteSelection(),
  "clipboard.copy": (view) => view.copySelection(),
  "clipboard.cut": (view) => view.cutSelection(),
  "clipboard.paste": (view) => view.pasteClipboard(),
};

const STORY_BINDINGS = [...pianoRollBindings, ...globalBindings].filter(
  (binding) => binding.action in HANDLERS,
);

/** Registers piano roll hotkeys on the story view's canvas. */
export function usePianoRollStoryHotkeys(view: AnyChartView | null): void {
  const pianoRoll = view instanceof PianoRollView ? view : null;
  const canvas = pianoRoll?.getCanvas() ?? null;
  useHotkeys(
    STORY_BINDINGS.map((binding) => ({
      hotkey: binding.hotkey,
      callback: () => {
        if (pianoRoll) HANDLERS[binding.action](pianoRoll, binding.args);
      },
      options: { requireReset: binding.options.requireReset ?? true },
    })) as never,
    (canvas ? { target: canvas } : { enabled: false }) as never,
  );
}
