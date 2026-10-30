import { EntityId } from "./entity";

/** Listener notified after the selected entity IDs change. */
export type SelectionListener = (selectedIds: readonly EntityId[]) => void;

/**
 * Selection model for managing selected entity IDs, regardless of their type
 * or associated view.
 */
export class SelectionModel {
  readonly #selectedIds = new Set<EntityId>();
  readonly #listeners = new Set<SelectionListener>();
  #revision = 0;

  /** Returns the selected IDs in insertion order. */
  public getSelectedIds(): EntityId[] {
    return [...this.#selectedIds];
  }

  /** Returns the current selection revision. */
  public getRevision(): number {
    return this.#revision;
  }

  /** Reports whether an entity ID is selected. */
  public isSelected(id: EntityId): boolean {
    return this.#selectedIds.has(id);
  }

  /** Subscribes to selection changes and returns an unsubscribe function. */
  public subscribe(listener: SelectionListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Replaces the selection, notifying only when its contents change. */
  public setSelectedIds(ids: Iterable<EntityId>): void {
    const next = new Set(ids);
    const prev = this.#selectedIds;

    // If the new selection is identical to the current one, do nothing.
    if (next.size === prev.size && [...next].every((id) => prev.has(id))) {
      return;
    }

    // Update the selection with the new IDs.
    this.#selectedIds.clear();
    next.forEach((id) => this.#selectedIds.add(id));
    this.notify();
  }

  /** Adds an entity ID to the selection. */
  public add(id: EntityId): void {
    if (this.#selectedIds.has(id)) {
      return;
    }
    this.#selectedIds.add(id);
    this.notify();
  }

  /** Removes an entity ID from the selection. */
  public delete(id: EntityId): void {
    if (!this.#selectedIds.delete(id)) {
      return;
    }
    this.notify();
  }

  /** Clears the selection. */
  public clear(): void {
    if (this.#selectedIds.size === 0) {
      return;
    }
    this.#selectedIds.clear();
    this.notify();
  }

  private notify(): void {
    this.#revision += 1;
    const selectedIds = this.getSelectedIds();
    this.#listeners.forEach((listener) => listener(selectedIds));
  }
}
