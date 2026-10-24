import { Box2 } from "three";
import type { SelectionModel } from "@openchart/views";
import type { PianoRollNote } from "./types";
import { BaseSelection } from "../shared/selection";

export class SelectionContext extends BaseSelection<PianoRollNote> {
  #bounds: Box2 | null = null;
  #sharedSelection: SelectionModel | null = null;
  #sharedUnsubscribe: (() => void) | null = null;
  #getId: ((note: PianoRollNote) => string) | null = null;
  #syncingShared = false;
  private revision = 0;

  public getRevision(): number {
    return this.revision;
  }

  public bindSharedSelection(
    selection: SelectionModel,
    getId: (note: PianoRollNote) => string,
    resolveId: (id: string) => PianoRollNote | null,
  ): void {
    this.#sharedUnsubscribe?.();
    this.#sharedSelection = selection;
    this.#getId = getId;
    this.#sharedUnsubscribe = selection.subscribe((ids) => {
      this.#syncingShared = true;
      try {
        super.set(
          ids
            .map((id) => resolveId(id))
            .filter((note): note is PianoRollNote => note !== null),
        );
      } finally {
        this.#syncingShared = false;
      }
    });
    const selectedIds = selection.getSelectedIds();
    this.#syncingShared = true;
    try {
      super.set(
        selectedIds
          .map((id) => resolveId(id))
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
    return (
      super.isSelected(note) ||
      this.notes.some(
        (selected) => selected.midiNote.noteOn === note.midiNote.noteOn,
      )
    );
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
    if (this.#syncingShared || !this.#sharedSelection || !this.#getId) return;
    this.#sharedSelection.setSelectedIds(this.notes.map(this.#getId));
  }
}
