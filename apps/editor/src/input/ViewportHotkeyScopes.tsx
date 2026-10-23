import { useContext } from "react";
import { useViewportSnapshot } from "../hooks/useViewportSnapshot";
import { InputProviderContext } from "./context.ts";
import { Hotkeys } from "./Hotkeys.tsx";
import { highwayBindings, pianoRollBindings } from "./index.ts";
import { HotkeysProvider } from "./lib.ts";

/**
 * Registers the view-specific bindings. Each scope is nested inside the root
 * provider's `global` scope, so while its view is active a highway or piano
 * roll binding overrides a global one with the same chord, and chords the view
 * does not bind fall through to global. One registrar per scope acts on the
 * active view through actions, so inactive viewports never double-fire.
 */
export function ViewHotkeyScopes() {
  const ready = useContext(InputProviderContext);
  const { activeViewId } = useViewportSnapshot();
  if (!ready) return null;
  return (
    <>
      <HotkeysProvider scope="highway" enabled={activeViewId === "highway"}>
        <Hotkeys bindings={highwayBindings} />
      </HotkeysProvider>
      <HotkeysProvider
        scope="pianoroll"
        enabled={activeViewId === "piano-roll"}
      >
        <Hotkeys bindings={pianoRollBindings} />
      </HotkeysProvider>
    </>
  );
}
