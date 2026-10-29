import { Box2 } from "three";
import type { SelectionModel } from "@openchart/views";
import type { PianoRollNote } from "./types";
import { BaseSelection } from "../shared/selection";

export class SelectionContext extends BaseSelection<PianoRollNote> {
  #bounds: Box2 | null = null;
  #model: SelectionModel | null = null;
  #sharedUnsubscribe: (() => void) | null = null;
  #resolveId: ((id: string) => PianoRollNote | null) | null = null;
  #resolvedById = new Map<string, PianoRollNote | null>();
  #syncingShared = false;
  private revision = 0;

  public getRevision(): number {
    return this.revision;
  }

  public bindSharedSelection(
    model: SelectionModel,
    resolveId: (id: string) => PianoRollNote | null,
  ): void {
    if (this.#model === model && this.#resolveId === resolveId) {
      this.refreshSharedSelection();
      return;
    }
    this.#sharedUnsubscribe?.();
    this.#model = model;
    this.#resolveId = resolveId;
    this.#resolvedById.clear();
    this.#sharedUnsubscribe = model.subscribe((ids) => {
      this.syncSharedSelection(ids);
    });
    this.refreshSharedSelection();
  }

  public unbindSharedSelection(): void {
    this.#sharedUnsubscribe?.();
    this.#sharedUnsubscribe = null;
    this.#model = null;
    this.#resolveId = null;
    this.#resolvedById.clear();
    this.#syncingShared = true;
    try {
      super.clear();
    } finally {
      this.#syncingShared = false;
    }
  }

  public refreshSharedSelection(): void {
    if (!this.#model) return;
    this.#resolvedById.clear();
    this.syncSharedSelection(this.#model.getSelectedIds());
  }

  private syncSharedSelection(ids: readonly string[]): void {
    this.#syncingShared = true;
    try {
      super.set(
        ids
          .map((id) => {
            if (!this.#resolvedById.has(id)) {
              this.#resolvedById.set(id, this.#resolveId?.(id) ?? null);
            }
            return this.#resolvedById.get(id) ?? null;
          })
          .filter((note): note is PianoRollNote => note !== null),
      );
    } finally {
      this.#syncingShared = false;
    }
  }

  public get bounds(): Box2 | null {
    return this.#bounds;
  }

  public set bounds(value: Box2 | null) {
    this.#bounds =
      value !== null ? new Box2().setFromPoints([value.min, value.max]) : value;
  }

  public override get notes(): PianoRollNote[] {
    return super.notes;
  }

  public override isSelected(note: PianoRollNote): boolean {
    return this.#model?.isSelected(note.id) ?? super.isSelected(note);
  }

  public set notes(value: PianoRollNote[]) {
    this.set(value);
  }

  public get isSelecting(): boolean {
    return this.#bounds !== null;
  }

  public clear(): void {
    this.#bounds = null;
    super.clear();
  }

  public intersects(rect: Box2): boolean {
    return this.#bounds?.intersectsBox(rect) ?? false;
  }

  protected override onChanged(): void {
    this.revision += 1;
    if (this.#syncingShared || !this.#model) return;
    this.#model.setSelectedIds(this.notes.map((note) => note.id));
  }
}
