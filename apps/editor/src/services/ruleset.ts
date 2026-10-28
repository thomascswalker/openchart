import {
  compileRuleset,
  DefaultRuleset,
  loadRuleset,
  type CompiledRuleset,
  type Ruleset,
} from "@openchart/views";
import { StatefulService } from "../platform/services";
import type { EditorStateService } from "./editor/state";

export interface RulesetSnapshot {
  /** The active, validated ruleset. */
  ruleset: Ruleset;
  /** `ruleset` compiled into per-track rules; what views and editing consume. */
  compiled: CompiledRuleset;
  /** Increments on every successful swap; use it in memo/session signatures. */
  revision: number;
}

/**
 * Owns the active ruleset. Everything chart-shaped (track list, lanes, phrases,
 * editing rules, project settings) derives from `snapshot.compiled`, so
 * replacing the ruleset re-derives the whole hierarchy.
 */
export class RulesetService extends StatefulService<RulesetSnapshot> {
  public static dependencies = ["editor.state"];

  private readonly editorState: EditorStateService;

  constructor(editorState: EditorStateService) {
    super();
    this.editorState = editorState;
    this._snapshot = createSnapshot(DefaultRuleset, 0);
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
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      this.editorState.setError(`Invalid ruleset: ${detail}`);
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

function createSnapshot(ruleset: Ruleset, revision: number): RulesetSnapshot {
  return { ruleset, compiled: compileRuleset(ruleset), revision };
}
