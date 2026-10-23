import { useContext, useMemo, useSyncExternalStore } from "react";
import { useService } from "../platform";
import type { ActiveChartViewService } from "../services/editor/activeChartView";
import { InputProviderContext } from "./context.ts";
import type { Binding } from "./define.ts";
import { dispatchBinding } from "./dispatch.ts";
import { useAppHotkeys, useHotkeys } from "./lib.ts";

function useActiveCanvas(): HTMLCanvasElement | null {
  const service = useService<ActiveChartViewService>(
    "editor.active-chart-view",
  );
  const view = useSyncExternalStore(
    service.subscribe,
    service.getSnapshot,
    service.getSnapshot,
  );
  return view?.getCanvas() ?? null;
}

/**
 * Registers bindings with the library. Callbacks only dispatch the binding's
 * action, so everything else (conditions, state) lives in actions/services.
 */
function useBindingHotkeys(
  bindings: readonly Binding[],
  options?: Record<string, unknown>,
): void {
  const appHotkeys = useAppHotkeys() as unknown as Record<string, unknown>;
  useHotkeys(
    bindings.map((binding) => ({
      hotkey: appHotkeys[binding.id] as never,
      callback: () => dispatchBinding(binding),
    })),
    options as never,
  );
}

function RegisteredHotkeys({ bindings }: { bindings: readonly Binding[] }) {
  const canvas = useActiveCanvas();
  const documentBindings = useMemo(
    () => bindings.filter((binding) => binding.target === "document"),
    [bindings],
  );
  const canvasBindings = useMemo(
    () => bindings.filter((binding) => binding.target === "canvas"),
    [bindings],
  );

  useBindingHotkeys(documentBindings);
  // Without a canvas the target would fall back to `document`, so switch the
  // canvas-targeted bindings off instead.
  useBindingHotkeys(
    canvasBindings,
    canvas ? { target: canvas } : { enabled: false },
  );
  return null;
}

/**
 * Registers a binding table. Mount it inside a `HotkeysProvider` whose scope
 * matches the table's scope (the root provider for `global`). Renders nothing
 * when there is no `InputProvider`, because the library hooks require one.
 */
export function Hotkeys({ bindings }: { bindings: readonly Binding[] }) {
  const ready = useContext(InputProviderContext);
  return ready ? <RegisteredHotkeys bindings={bindings} /> : null;
}
