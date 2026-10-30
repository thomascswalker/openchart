import type { AbstractEditingMode, EditingModeId, ModeRegistry } from "./mode";
import type { TrackDescriptor } from "../../ruleset/compile";

/** Resolves modes in registration order, which also defines their priority. */
export class EditingModeRegistry implements ModeRegistry {
  private readonly modes: AbstractEditingMode[] = [];
  private readonly modeIds = new Set<string>();

  /** Registers a mode at the end of the priority list. */
  public register(mode: AbstractEditingMode): void {
    if (this.modeIds.has(mode.id)) {
      throw new Error(`Editing mode '${mode.id}' is already registered`);
    }
    this.modes.push(mode);
    this.modeIds.add(mode.id);
  }

  /** Returns a registered mode by its stable identifier. */
  public getById(modeId: EditingModeId): AbstractEditingMode | null {
    return this.modes.find((mode) => mode.id === modeId) ?? null;
  }

  /** Returns the first registered mode that applies to the host and track. */
  public resolve(
    track: TrackDescriptor,
    hostKind: string,
  ): AbstractEditingMode | null {
    return (
      this.modes.find(
        (mode) => mode.hostKinds.has(hostKind) && mode.appliesTo(track),
      ) ?? null
    );
  }

  /** Lists registered modes available to a host in priority order. */
  public listForHost(hostKind: string): readonly AbstractEditingMode[] {
    return this.modes.filter((mode) => mode.hostKinds.has(hostKind));
  }

  /** Reports whether any registered mode can edit the track in this host. */
  public canHost(track: TrackDescriptor, hostKind: string): boolean {
    return this.resolve(track, hostKind) !== null;
  }
}
