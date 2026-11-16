import { RulesetService } from '..';
import { EditorStateService } from '../../editor/state';

export function createTestRulesetService(): RulesetService {
  return new RulesetService(new EditorStateService());
}
