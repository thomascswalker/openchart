import { useMemo, useState, type ReactNode } from "react";
import { InputProviderContext } from "./context.ts";
import { appHotkeys, allBindings } from "./index.ts";
import { displayHotkey, EffectiveLabelsContext } from "./labels.ts";
import { HotkeysProvider, useAppHotkeys, type CustomHotkeys } from "./lib.ts";
import { loadCustomHotkeys, saveCustomHotkeys } from "./storage.ts";

/** Publishes display labels for the effective (default or custom) hotkeys. */
function EffectiveLabelsBridge({ children }: { children: ReactNode }) {
  const live = useAppHotkeys() as unknown as Record<
    string,
    { hotkey?: unknown } | undefined
  >;
  const labels = useMemo(
    () =>
      new Map(
        allBindings.map((binding) => [
          binding.id,
          displayHotkey(live[binding.id]?.hotkey),
        ]),
      ),
    [live],
  );
  return (
    <EffectiveLabelsContext.Provider value={labels}>
      {children}
    </EffectiveLabelsContext.Provider>
  );
}

/** Root provider: declares every binding and owns the user's overrides. */
export function InputProvider({ children }: { children: ReactNode }) {
  const [customHotkeys] = useState<CustomHotkeys>(loadCustomHotkeys);
  return (
    <HotkeysProvider
      appHotkeys={appHotkeys}
      customHotkeys={customHotkeys}
      onCustomHotkeysChange={saveCustomHotkeys}
      // Fire once per press; bindings that should repeat opt out.
      defaultOptions={{ hotkey: { requireReset: true } }}
    >
      <InputProviderContext.Provider value={true}>
        <EffectiveLabelsBridge>{children}</EffectiveLabelsBridge>
      </InputProviderContext.Provider>
    </HotkeysProvider>
  );
}
