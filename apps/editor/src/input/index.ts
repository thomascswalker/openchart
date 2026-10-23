import { defineAppHotkeys } from "./lib.ts";
import type { Binding } from "./define.ts";
import { globalBindings } from "./global.ts";
import { highwayBindings } from "./highway.ts";
import { pianoRollBindings } from "./pianoroll.ts";

export type {
  Binding,
  BindingSpec,
  BindingTarget,
  InputScope,
} from "./define.ts";
export { globalBindings, highwayBindings, pianoRollBindings };

/** Every binding, global first. Order matters for label lookups. */
export const allBindings: readonly Binding[] = [
  ...globalBindings,
  ...highwayBindings,
  ...pianoRollBindings,
];

export const bindingsById: ReadonlyMap<string, Binding> = new Map(
  allBindings.map((binding) => [binding.id, binding]),
);

/** Library declarations for the bindings: id, default chord, meta, scope. */
function toDeclarations(
  bindings: readonly Binding[],
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    bindings.map((binding) => [
      binding.id,
      {
        hotkey: binding.hotkey,
        meta: { name: binding.name, group: binding.group },
        scope: binding.scope,
        ...(Object.keys(binding.options).length > 0
          ? { options: binding.options }
          : {}),
      },
    ]),
  );
}

// The declarations are built from data, so their literal types are erased
// here. Ids are plain strings; see `bindingsById` for the typed view.
export const appHotkeys = defineAppHotkeys(
  toDeclarations(allBindings) as unknown as Parameters<
    typeof defineAppHotkeys
  >[0],
);

declare module "@tanstack/react-hotkeys" {
  interface Register {
    appHotkeys: typeof appHotkeys;
  }
}
