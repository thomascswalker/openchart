import type { Binding, InputScope } from "./define.ts";

const KEY_NAMES: Record<string, string> = {
  Mod: "Ctrl/Cmd",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

const SCOPE_TITLES: Record<InputScope, string> = {
  global: "Global",
  highway: "Highway",
  pianoroll: "Piano Roll",
};

/** Platform-neutral chord text for documentation, e.g. `Ctrl/Cmd + Shift + S`. */
export function formatHotkeyForDocs(hotkey: string): string {
  // A trailing "+" separator is never part of a chord here, so a plain split
  // is safe; bindings use `Mod+,` rather than `Mod++`.
  return hotkey
    .split("+")
    .map((part) => KEY_NAMES[part] ?? part)
    .join(" + ");
}

/**
 * Renders the keyboard tables for `controls.md` from the binding tables, so
 * the docs can never drift from the code. Run `npm run docs:controls`.
 */
export function renderHotkeyTables(bindings: readonly Binding[]): string {
  const scopes: InputScope[] = ["global", "highway", "pianoroll"];
  const sections = scopes.map((scope) => {
    const rows = bindings
      .filter((binding) => binding.scope === scope)
      .map(
        (binding) =>
          `| **\`${formatHotkeyForDocs(binding.hotkey)}\`** | ${binding.name} | ${binding.group} |`,
      );
    return [
      `### ${SCOPE_TITLES[scope]}`,
      "",
      "| Hotkey | Description | Group |",
      "| ------ | ----------- | ----- |",
      ...rows,
    ].join("\n");
  });
  return sections.join("\n\n");
}
