import { Midi } from "@openchart/midi";
import {
  defaultConfig,
  type SongViewConfig,
  type TrackDescriptor,
  describeTrack,
} from "../config.js";
import { SongView } from "../chartView.js";
import { getPhrasePitch } from "../chartEditing.js";
import { ChartDocument } from "./chartDocument.js";
import type { EditingTarget, ModeRegistry } from "./mode.js";
import { EditingModeRegistry } from "./modeRegistry.js";
import { defaultModes } from "./modes/index.js";
import { createEditingSession, type EditingSession } from "./session.js";

/** In-memory snapshot history returned by standalone editing instances. */
export interface StandaloneHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly isDirty: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
  undo(): boolean;
  redo(): boolean;
}

/** Standalone editing API for unit tests, Storybook, and embedded tools. */
export interface StandaloneEditing {
  registry: ModeRegistry;
  createSession(target: EditingTarget, hostKind: string): EditingSession;
  history: StandaloneHistory;
}

/** Creates a registry, raw editing sessions, and in-memory snapshot history. */
export function createStandaloneEditing(
  midi: Midi,
  config: SongViewConfig = defaultConfig,
): StandaloneEditing {
  const document = createDocument(midi, config);
  const history = new StandaloneHistoryImpl(midi);
  const registry = new EditingModeRegistry();
  defaultModes.forEach((mode) => registry.register(mode));

  return {
    registry,
    history,
    createSession(target, hostKind) {
      const normalizedTarget = resolveTarget(target, document);
      const descriptor = descriptorForTarget(
        normalizedTarget.trackKey,
        normalizedTarget.trackIndex,
        midi,
        config,
      );
      const mode = registry.resolve(descriptor, hostKind);
      if (!mode) {
        throw new Error(
          `No editing mode supports '${normalizedTarget.trackKey}' in '${hostKind}'`,
        );
      }
      return createEditingSession({
        document,
        mode,
        target: normalizedTarget,
        hostKind,
        config,
        transaction: history,
      });
    },
  };
}

function createDocument(midi: Midi, config: SongViewConfig): ChartDocument {
  const descriptors = config.tracks.map(describeTrack);
  return new ChartDocument(
    midi,
    (trackIndex, phraseType) => {
      const name = midi.tracks[trackIndex]?.name;
      const descriptor = descriptors.find((item) => item.name === name);
      return descriptor ? getPhrasePitch(descriptor, phraseType) : null;
    },
    config,
  );
}

function resolveTarget(
  target: EditingTarget,
  document: ChartDocument,
): EditingTarget {
  return {
    ...target,
    trackIndex: target.trackIndex ?? document.findTrackIndex(target.trackKey),
  };
}

function descriptorForTarget(
  trackKey: string,
  trackIndex: number | null,
  midi: Midi,
  config: SongViewConfig,
): TrackDescriptor {
  const song = new SongView(midi, config);
  const descriptor = song
    .getTrackDescriptors()
    .find((item) => item.key === trackKey);
  if (descriptor) return descriptor;

  const track = trackIndex === null ? undefined : midi.tracks[trackIndex];
  const name = track?.name ?? trackKey;
  const syntheticConfig = {
    name,
    key: trackKey,
    type: "instrument" as const,
    noteCount: 128,
    notes: {},
  };
  return {
    key: trackKey,
    name,
    type: "instrument",
    visible: true,
    editable: true,
    config: syntheticConfig,
  };
}

class StandaloneHistoryImpl implements StandaloneHistory {
  private readonly midi: Midi;
  private readonly initial: Uint8Array;
  private current: Midi;
  private beforeTransaction: Midi | null = null;
  private transactionDepth = 0;
  private transactionChanged = false;
  private readonly undoStack: Midi[] = [];
  private readonly redoStack: Midi[] = [];

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

  public get undoDepth(): number {
    return this.undoStack.length;
  }

  public get redoDepth(): number {
    return this.redoStack.length;
  }

  public begin(): void {
    if (this.transactionDepth === 0) {
      this.beforeTransaction = this.midi.clone();
      this.transactionChanged = false;
    }
    this.transactionDepth += 1;
  }

  public record(): void {
    if (this.transactionDepth === 0) {
      throw new Error("Cannot record outside an editing transaction");
    }
    this.transactionChanged = true;
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
  }

  public rollback(): boolean {
    if (this.transactionDepth === 0 || !this.beforeTransaction) return false;
    restoreMidi(this.midi, this.beforeTransaction);
    this.transactionDepth = 0;
    this.beforeTransaction = null;
    this.transactionChanged = false;
    return true;
  }

  public undo(): boolean {
    if (!this.canUndo) return false;
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.redoStack.push(this.current);
    restoreMidi(this.midi, previous);
    this.current = this.midi.clone();
    return true;
  }

  public redo(): boolean {
    if (!this.canRedo) return false;
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.current);
    restoreMidi(this.midi, next);
    this.current = this.midi.clone();
    return true;
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
