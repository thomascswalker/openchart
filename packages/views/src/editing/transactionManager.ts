import type { ChartEditAction } from "./action.js";
import type { ChartDocument } from "./chartDocument.js";

export interface EditTransaction {
  beginEdit(): void;
  recordEdit(): void;
  endEdit(): void;
}

/** Bridges headless commands to the host application's transaction history. */
export class TransactionManager {
  public constructor(
    private readonly document: ChartDocument,
    private readonly transaction: EditTransaction,
  ) {}

  public dispatch(action: ChartEditAction): boolean {
    const changed = this.document.apply(action);
    if (changed) this.transaction.recordEdit();
    return changed;
  }

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
