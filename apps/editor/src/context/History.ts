import type { Midi } from "@openchart/core";

export const DEFAULT_HISTORY_CAPACITY = 256;
export const MIN_HISTORY_CAPACITY = 1;
export const MAX_HISTORY_CAPACITY = 1024;

export class History {
  private capacity: number;
  private undoStack: Midi[] = [];
  private redoStack: Midi[] = [];
  private current: Midi | null = null;
  private transactionDepth = 0;
  private transactionChanged = false;

  public constructor(capacity = DEFAULT_HISTORY_CAPACITY) {
    this.validateCapacity(capacity);
    this.capacity = capacity;
  }

  public get canUndo(): boolean {
    return this.undoStack.length > 0 && this.transactionDepth === 0;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0 && this.transactionDepth === 0;
  }

  public get isInTransaction(): boolean {
    return this.transactionDepth > 0;
  }

  public reset(midi: Midi): void {
    this.undoStack = [];
    this.redoStack = [];
    this.current = midi.clone();
    this.transactionDepth = 0;
    this.transactionChanged = false;
  }

  public setCapacity(capacity: number): void {
    this.validateCapacity(capacity);
    this.capacity = capacity;
    const excess = this.undoStack.length + this.redoStack.length - capacity;
    if (excess <= 0) return;

    const undoToRemove = Math.min(excess, this.undoStack.length);
    this.undoStack.splice(0, undoToRemove);
    const remainingExcess = excess - undoToRemove;
    if (remainingExcess > 0) {
      this.redoStack.splice(0, remainingExcess);
    }
  }

  public beginTransaction(): void {
    this.transactionDepth += 1;
  }

  public recordEdit(midi: Midi): void {
    if (this.transactionDepth > 0) {
      this.transactionChanged = true;
      return;
    }
    this.commit(midi);
  }

  public endTransaction(midi: Midi): boolean {
    if (this.transactionDepth === 0) return false;
    this.transactionDepth -= 1;
    if (this.transactionDepth > 0 || !this.transactionChanged) return false;

    this.commit(midi);
    this.transactionChanged = false;
    return true;
  }

  /**
   * Abandons every open transaction and returns a copy of the document as it
   * was before the outermost one began, without adding history. Returns null
   * when no transaction is open.
   */
  public rollbackTransaction(): Midi | null {
    if (this.transactionDepth === 0 || !this.current) return null;
    this.transactionDepth = 0;
    this.transactionChanged = false;
    return this.current.clone();
  }

  public undo(): Midi | null {
    if (!this.canUndo || !this.current) return null;
    const restored = this.undoStack.pop()!;
    this.redoStack.push(this.current.clone());
    this.current = restored.clone();
    return restored.clone();
  }

  public redo(): Midi | null {
    if (!this.canRedo || !this.current) return null;
    const restored = this.redoStack.pop()!;
    this.undoStack.push(this.current.clone());
    this.current = restored.clone();
    return restored.clone();
  }

  private commit(midi: Midi): void {
    if (this.current) {
      this.undoStack.push(this.current.clone());
      if (this.undoStack.length > this.capacity) this.undoStack.shift();
    }
    this.redoStack = [];
    this.current = midi.clone();
  }

  private validateCapacity(capacity: number): void {
    if (
      !Number.isInteger(capacity) ||
      capacity < MIN_HISTORY_CAPACITY ||
      capacity > MAX_HISTORY_CAPACITY
    ) {
      throw new RangeError(
        `History capacity must be an integer from ${MIN_HISTORY_CAPACITY} to ${MAX_HISTORY_CAPACITY}`,
      );
    }
  }
}
