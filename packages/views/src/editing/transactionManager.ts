import type { ChartEditAction } from "./action.js";
import type { ChartDocument } from "./chartDocument.js";

/** Legacy history bridge used while editor callers migrate to sessions. */
export interface EditTransaction {
  /** Opens a grouped edit transaction. */
  beginEdit(): void;
  /** Records a successful document change. */
  recordEdit(): void;
  /** Closes a grouped edit transaction. */
  endEdit(): void;
}

/** @deprecated Use EditingSession; this compatibility bridge is removed in Phase 4. */
export class TransactionManager {
  public constructor(
    private readonly document: ChartDocument,
    private readonly transaction: EditTransaction,
  ) {}

  /** Dispatches one legacy action and records it when it changes the document. */
  public dispatch(action: ChartEditAction): boolean {
    const changed = this.document.applyLegacy(action);
    if (changed) this.transaction.recordEdit();
    return changed;
  }

  /** Dispatches legacy actions inside one host transaction. */
  public dispatchBatch(actions: readonly ChartEditAction[]): boolean {
    if (actions.length === 0) return false;
    this.transaction.beginEdit();
    let changed = false;
    try {
      for (const action of actions) {
        changed = this.dispatch(action) || changed;
      }
      return changed;
    } finally {
      this.transaction.endEdit();
    }
  }
}
