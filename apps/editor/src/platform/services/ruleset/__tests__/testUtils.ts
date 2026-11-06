import { EditorStateService } from "../../editor/state";
import { RulesetService } from "..";

export function createTestRulesetService(): RulesetService {
  return new RulesetService(new EditorStateService());
}
