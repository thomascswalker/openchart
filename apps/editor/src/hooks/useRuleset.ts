import { useSyncExternalStore } from "react";
import Platform from "../platform";
import type { RulesetService } from "../services/ruleset";

/** Subscribes to the active ruleset; re-renders when it is replaced. */
export function useRuleset() {
  const ruleset = Platform.services.get<RulesetService>("ruleset");
  return useSyncExternalStore(
    ruleset.subscribe,
    ruleset.getSnapshot,
    ruleset.getSnapshot,
  );
}
