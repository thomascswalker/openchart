/**
 * Binding tables.
 *
 * Every hotkey in the editor is one row in `global.ts`, `highway.ts` or
 * `pianoroll.ts`. A row maps a chord to an `Action` (plus arguments); nothing
 * else in the code base should mention a chord.
 */

/** Where a binding is active. Maps 1:1 onto a library scope of the same name. */
export type InputScope = "global" | "highway" | "pianoroll";

/**
 * `document`: fires wherever focus is (like the old window listeners).
 * `canvas`: fires only while the active view's canvas has focus.
 */
export type BindingTarget = "document" | "canvas";

export interface BindingSpec {
  /** Default chord in library syntax, e.g. `Mod+S`, `Shift+ArrowUp`, `]`. */
  hotkey: string;
  /** Arguments passed to the action after the services accessor. */
  args?: readonly unknown[];
  /** Human-readable name for menus, cheat sheets and the Hotkey Editor. */
  name: string;
  /** Group heading for cheat sheets and the Hotkey Editor. */
  group: string;
  /** Defaults to `document`. */
  target?: BindingTarget;
  /** Set `requireReset: false` for bindings that should repeat while held. */
  options?: { requireReset?: boolean };
}

export interface Binding {
  /**
   * Stable id: `<scope>.<actionId>[.<variant>]`. Saved custom hotkeys are keyed
   * by this, so treat it as a public contract once released.
   */
  readonly id: string;
  readonly scope: InputScope;
  readonly action: string;
  readonly variant: string | undefined;
  readonly hotkey: string;
  readonly args: readonly unknown[];
  readonly name: string;
  readonly group: string;
  readonly target: BindingTarget;
  readonly options: { requireReset?: boolean };
}

/**
 * Builds the bindings for one scope. Table keys are `actionId` or
 * `actionId#variant`, so the action id is written exactly once per row.
 */
export function defineBindings(
  scope: InputScope,
  table: Readonly<Record<string, BindingSpec>>,
): readonly Binding[] {
  const seen = new Set<string>();
  return Object.entries(table).map(([key, spec]) => {
    const separator = key.indexOf("#");
    const action = separator < 0 ? key : key.slice(0, separator);
    const variant = separator < 0 ? undefined : key.slice(separator + 1);
    const id = `${scope}.${action}${variant ? `.${variant}` : ""}`;
    if (seen.has(id)) {
      throw new Error(`Duplicate binding id: ${id}`);
    }
    seen.add(id);
    return {
      id,
      scope,
      action,
      variant,
      hotkey: spec.hotkey,
      args: spec.args ?? [],
      name: spec.name,
      group: spec.group,
      target: spec.target ?? "document",
      options: spec.options ?? {},
    };
  });
}
