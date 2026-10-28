import { EditorStateService } from "../editor/state";
import { RulesetService } from "../ruleset";

export function createTestRulesetService(): RulesetService {
  return new RulesetService(new EditorStateService());
}
