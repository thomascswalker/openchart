import type { EditingSession } from "@openchart/views";

export interface EditingContextSnapshot {
  values: Record<string, string | boolean | null>;
  commandTypes: string[];
}

/** Creates active-mode and capability context keys for action conditions. */
export function createEditingContextSnapshot(
  session: EditingSession | null,
  previousCommandTypes: readonly string[] = [],
): EditingContextSnapshot {
  const commandTypes = session
    ? [
        ...session.mode.capabilities.rawCommands,
        ...session.mode.capabilities.domainCommands,
      ]
    : [];
  const values: Record<string, string | boolean | null> = {
    "editing.mode": session?.mode.id ?? null,
  };
  for (const commandType of new Set([
    ...previousCommandTypes,
    ...commandTypes,
  ])) {
    values[`editing.can.${commandType}`] = Boolean(session?.can(commandType));
  }
  values["editing.can.MOVE_SELECTION"] = Boolean(
    session?.can("MOVE_NOTES") ||
    session?.can("MOVE_CHART_NOTES") ||
    session?.can("MOVE_VOCAL_ENTITIES"),
  );
  return { values, commandTypes };
}
