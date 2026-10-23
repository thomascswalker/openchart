import { createContext } from "react";

/**
 * True below `InputProvider`. Registrars render nothing without it, so
 * components such as `Viewport` can still be rendered in isolation (tests,
 * stories) without the hotkey system.
 */
export const InputProviderContext = createContext(false);
