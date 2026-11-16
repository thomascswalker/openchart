import {
  type CompiledRuleset,
  DefaultRuleset,
  type Ruleset,
  compileRuleset,
  loadRuleset,
} from '@openchart/views';

import { IEditorStateService } from '../editor/state';
import { createDecorator } from '../service';
import { StatefulService } from '../statefulService';

export interface RulesetSnapshot {
  /** The active, validated ruleset. */
  ruleset: Ruleset;
  /** `ruleset` compiled into per-track rules; what views and editing consume. */
  compiled: CompiledRuleset;
  /** Increments on every successful swap; use it in memo/session signatures. */
  revision: number;
}

function createSnapshot(ruleset: Ruleset, revision: number): RulesetSnapshot {
  return { ruleset, compiled: compileRuleset(ruleset), revision };
}

/**
 * Owns the active ruleset. Everything chart-shaped (track list, lanes, phrases,
 * editing rules, project settings) derives from `snapshot.compiled`, so
 * replacing the ruleset re-derives the whole hierarchy.
 */
export class RulesetService extends StatefulService<RulesetSnapshot> {
  constructor(
    @IEditorStateService private editorStateService: IEditorStateService,
  ) {
    super();
  }

  public static defaultSnapshot(): RulesetSnapshot {
    return createSnapshot(DefaultRuleset, 0);
  }

  /** The compiled rules of the active ruleset. */
  public get compiled(): CompiledRuleset {
    return this._snapshot.compiled;
  }

  public readonly reset = (): void => {
    this._snapshot = createSnapshot(
      DefaultRuleset,
      this._snapshot.revision + 1,
    );
    this.notify();
  };

  /**
   * Validates and activates a ruleset (JSON text or a parsed value). Returns
   * true on success; on failure the current ruleset stays active and the
   * problems are reported through `editor.state`.
   */
  public readonly setRuleset = (json: string | unknown): boolean => {
    const result = loadRuleset(json);
    if (!result.ok) {
      const detail = result.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      this.editorStateService.setError(`Invalid ruleset: ${detail}`);
      return false;
    }
    this._snapshot = createSnapshot(
      result.ruleset,
      this._snapshot.revision + 1,
    );
    this.notify();
    return true;
  };
}

export type IRulesetService = RulesetService;
export const IRulesetService = createDecorator<IRulesetService>('ruleset');
