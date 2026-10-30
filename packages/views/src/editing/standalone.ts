import { Midi } from "@openchart/midi";
import {
  DefaultCompiledRuleset,
  createUnmappedTrackRules,
  type CompiledRuleset,
  type TrackDescriptor,
} from "../ruleset/compile";
import type { RulesetContext } from "../ruleset/enforce";
import { CommandExecutor } from "./executor";
import { ClipboardService } from "./clipboard";
import type { IEditingTarget, ModeRegistry } from "./modes/mode";
import { createDefaultModeRegistry } from "./modes/index";
import { SelectionModel } from "./selection";
import { EditingSession, EditTransactionPort } from "./session";

/** In-memory snapshot history returned by standalone editing instances. */
export interface IStandaloneHistory extends EditTransactionPort {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly isDirty: boolean;
  readonly isInTransaction: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
  subscribe(listener: () => void): () => void;
  undo(): boolean;
  redo(): boolean;
}

/** Standalone editing API for unit tests, Storybook, and embedded tools. */
export interface StandaloneEditing {
  registry: ModeRegistry;
  selection: SelectionModel;
  clipboard: ClipboardService;
  createSession(target: IEditingTarget, hostKind: string): EditingSession;
  history: IStandaloneHistory;
}

/** Creates a registry, raw editing sessions, and in-memory snapshot history. */
export function createStandaloneEditing(
  midi: Midi,
  rules: CompiledRuleset = DefaultCompiledRuleset,
  rulesContext?: RulesetContext | (() => RulesetContext),
): StandaloneEditing {
  const document = new CommandExecutor(midi, rules);
  const history = new StandaloneHistory(midi);
  const registry = createDefaultModeRegistry();
  const selection = new SelectionModel();
  const clipboard = new ClipboardService();

  return {
    registry,
    selection,
    clipboard,
    history,
    createSession(target, hostKind) {
      const normalizedTarget = resolveTarget(target, document);
      const descriptor = descriptorForTarget(
        normalizedTarget.trackKey,
        normalizedTarget.trackIndex,
        midi,
        rules,
      );
      const mode = registry.resolve(descriptor, hostKind);
      if (!mode) {
        throw new Error(
          `No editing mode supports '${normalizedTarget.trackKey}' in '${hostKind}'`,
        );
      }
      return new EditingSession({
        document,
        mode,
        target: normalizedTarget,
        hostKind,
        rules,
        ...(rulesContext ? { rulesContext } : {}),
        transaction: history,
        selection,
        clipboard,
      });
    },
  };
}

function resolveTarget(
  target: IEditingTarget,
  document: CommandExecutor,
): IEditingTarget {
  return {
    trackKey: target.trackKey,
    difficulty: target.difficulty,
    trackIndex: target.trackIndex ?? document.findTrackIndex(target.trackKey),
  };
}

function descriptorForTarget(
  trackKey: string,
  trackIndex: number | null,
  midi: Midi,
  rules: CompiledRuleset,
): TrackDescriptor {
  const configured = rules.descriptors().find((item) => item.key === trackKey);
  if (configured) return configured;

  const track = trackIndex === null ? undefined : midi.tracks[trackIndex];
  const name = track?.name ?? trackKey;
  const unmapped = createUnmappedTrackRules(name, trackKey);
  return {
    key: trackKey,
    name,
    kind: unmapped.kind,
    visible: true,
    editable: true,
    rules: unmapped,
  };
}

class StandaloneHistory implements IStandaloneHistory {
  private readonly midi: Midi;
  private readonly initial: Uint8Array;
  private current: Midi;
  private beforeTransaction: Midi | null = null;
  private transactionDepth = 0;
  private transactionChanged = false;
  private readonly undoStack: Midi[] = [];
  private readonly redoStack: Midi[] = [];
  private readonly listeners = new Set<() => void>();

  public constructor(midi: Midi) {
    this.midi = midi;
    this.current = midi.clone();
    this.initial = midi.toBuffer();
  }

  public get canUndo(): boolean {
    return this.undoStack.length > 0 && this.transactionDepth === 0;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0 && this.transactionDepth === 0;
  }

  public get isDirty(): boolean {
    return !bytesEqual(this.initial, this.midi.toBuffer());
  }

  public get isInTransaction(): boolean {
    return this.transactionDepth > 0;
  }

  public get undoDepth(): number {
    return this.undoStack.length;
  }

  public get redoDepth(): number {
    return this.redoStack.length;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public begin(): void {
    if (this.transactionDepth === 0) {
      this.beforeTransaction = this.midi.clone();
      this.transactionChanged = false;
    }
    this.transactionDepth += 1;
    this.notify();
  }

  public record(): void {
    if (this.transactionDepth === 0) {
      throw new Error("Cannot record outside an editing transaction");
    }
    this.transactionChanged = true;
    this.notify();
  }

  public end(): void {
    if (this.transactionDepth === 0) {
      throw new Error("Cannot end an editing transaction that is not open");
    }
    this.transactionDepth -= 1;
    if (this.transactionDepth > 0) return;
    if (this.transactionChanged && this.beforeTransaction) {
      this.undoStack.push(this.beforeTransaction);
      this.redoStack.length = 0;
      this.current = this.midi.clone();
    }
    this.beforeTransaction = null;
    this.transactionChanged = false;
    this.notify();
  }

  public rollback(): boolean {
    if (this.transactionDepth === 0 || !this.beforeTransaction) return false;
    restoreMidi(this.midi, this.beforeTransaction);
    this.transactionDepth = 0;
    this.beforeTransaction = null;
    this.transactionChanged = false;
    this.notify();
    return true;
  }

  public undo(): boolean {
    if (!this.canUndo) return false;
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.redoStack.push(this.current);
    restoreMidi(this.midi, previous);
    this.current = this.midi.clone();
    this.notify();
    return true;
  }

  public redo(): boolean {
    if (!this.canRedo) return false;
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.current);
    restoreMidi(this.midi, next);
    this.current = this.midi.clone();
    this.notify();
    return true;
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

function restoreMidi(target: Midi, snapshot: Midi): void {
  const clone = snapshot.clone();
  target.header = clone.header;
  target.tracks = clone.tracks;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
