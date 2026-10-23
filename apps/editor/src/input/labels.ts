import { createContext, useContext } from "react";
import { allBindings, type Binding } from "./index.ts";
import { formatForDisplay } from "./lib.ts";

/** Binding id -> display label (`null` when the user unbound it). */
export type EffectiveLabels = ReadonlyMap<string, string | null>;

export const EffectiveLabelsContext = createContext<EffectiveLabels | null>(
  null,
);

/** Formats a chord or sequence for display on the current platform. */
export function displayHotkey(hotkey: unknown): string | null {
  if (typeof hotkey === "string") {
    return formatForDisplay(hotkey as never);
  }
  if (Array.isArray(hotkey)) {
    return hotkey.map((step) => formatForDisplay(step as never)).join(" ");
  }
  return null;
}

let defaultLabels: EffectiveLabels | null = null;

/** Labels for the declared defaults, used when no provider is mounted. */
export function getDefaultLabels(): EffectiveLabels {
  defaultLabels ??= new Map(
    allBindings.map((binding) => [binding.id, displayHotkey(binding.hotkey)]),
  );
  return defaultLabels;
}

/** First binding for an action; global bindings win. Variant is optional. */
export function findBinding(
  action: string,
  variant?: string,
): Binding | undefined {
  return allBindings.find(
    (binding) =>
      binding.action === action &&
      (variant === undefined || binding.variant === variant),
  );
}

export function shortcutLabel(
  action: string,
  variant?: string,
  labels: EffectiveLabels = getDefaultLabels(),
): string | undefined {
  const binding = findBinding(action, variant);
  if (!binding) return undefined;
  return labels.get(binding.id) ?? undefined;
}

/**
 * Returns a lookup for the label of an action's binding, honoring the user's
 * custom hotkeys. Menus and tooltips use it so a remap shows up everywhere.
 */
export function useShortcutResolver(): (
  action: string,
  variant?: string,
) => string | undefined {
  const labels = useContext(EffectiveLabelsContext) ?? getDefaultLabels();
  return (action, variant) => shortcutLabel(action, variant, labels);
}
