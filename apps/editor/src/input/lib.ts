/**
 * The only module that imports `@tanstack/react-hotkeys`.
 *
 * The library is alpha; keeping every import here means API churn is fixed in
 * one place instead of across the editor.
 */
export {
  HotkeysProvider,
  defineAppHotkeys,
  formatForDisplay,
  useAppHotkeys,
  useHotkeys,
} from "@tanstack/react-hotkeys";
export type { CustomHotkeys } from "@tanstack/react-hotkeys";
