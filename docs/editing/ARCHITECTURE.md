# Unified Editing Architecture

This document captures the target boundaries, kernel contracts, invariants, and
settled design decisions for the editor editing framework.

## 1. Layer boundaries

```text
@openchart/midi
  Pure MIDI data and atomic MIDI primitives. Knows nothing about charts.
  ▲
@openchart/views
  Song/track/chart domain views and read helpers
  ├─ chart/ and vocals: pure, config-driven domain rules
  └─ editing/: entities, commands, document, preview, selection, clipboard,
               modes, registry, and session. No React, Three.js, DOM, or app imports.
  ▲
apps/editor/src/services/editor/editing.ts
  EditingService binds the kernel to document history, playback refresh,
  viewports, and application side effects.
  ▲
apps/editor/src/actions/**                  Commands from hotkeys and menus
apps/editor/src/components/views/**         Projections and gesture adapters
apps/editor/src/components/editor/**        Mode/tool descriptors and actions
```

### Enforced boundaries

1. Files under `apps/editor/src/components/**` do not call MIDI, chart, vocal,
   text, tempo, or time-signature mutators and do not materialize MIDI tracks.
   Mutations flow through `EditingService` → `EditingSession` → commands.
2. `packages/views/src/**` does not import from `apps/**`, `react`, `three`, or
   browser DOM globals.
3. Views do not call document history methods or the legacy edit-bracketing
   callbacks (`onBeginEdit`, `onEndEdit`, `onRollbackEdit`, `onNotesChanged`).
4. Entity ID strings are formatted and parsed only in `editing/entityId.ts`.
5. Special chart pitches are obtained through configuration and domain helpers,
   not numeric literals in app components.

The report-mode boundary checker is `scripts/check-editing-boundaries.mjs`.
Allowances are recorded in `scripts/editing-boundaries.allowlist.json` and are
only reduced as migrations remove violations.

## 2. Core concepts

| Concept        | Contract                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------- |
| Entity         | Addressable document data: note, phrase, lyric, text, tempo, or time signature.             |
| Raw command    | MIDI-level operation that `ChartDocument` can apply without chart semantics.                |
| Domain command | Mode-specific intent expanded into validated raw commands.                                  |
| Editing mode   | Declares tracks, commands, entities, tools, projection, classification, and pure expansion. |
| Editing target | `{ trackKey, trackIndex, difficulty? }`, identifying the viewport's edit target.            |
| Session        | Binds one mode and target to a host view.                                                   |
| Gesture        | Preview-able, cancellable edit: begin, replace preview, then commit or cancel.              |
| Preview        | Pure overlay data; computing it never mutates the document.                                 |
| Host kind      | View type such as `"piano-roll"` or `"highway"`.                                            |

## 3. Kernel contracts

### Entity IDs

```ts
type EntityKind =
  "note" | "phrase" | "lyric" | "text" | "tempo" | "time-signature";

interface ParsedEntityId {
  kind: "note" | "text" | "tempo" | "time-signature";
  trackIndex: number | null;
  eventId: string;
}
```

IDs keep the stable form `note:<trackIndex>:<eventId>` and extend that
convention for other entity classes. Stable event IDs survive snapshot-history
clones; track deletion and reordering remain unsupported.

### Raw commands and results

Raw note commands include `ADD_NOTES`, absolute `UPDATE_NOTES`, `MOVE_NOTES`,
`RESIZE_NOTES`, and `DELETE_ENTITIES`. Global commands cover text, tempo, and
time signatures. Domain intent is represented as a discriminated command with
a `type` field and is interpreted by the selected mode.

```ts
interface EditResult {
  changed: boolean;
  createdIds: readonly EntityId[];
  updatedIds: readonly EntityId[];
  removedIds: readonly EntityId[];
  rejections: readonly Rejection[];
}

interface Rejection {
  code: string;
  message: string;
  command: EditCommand;
}
```

`ChartDocument.applyBatch` validates all commands before mutation. Validation
failures reject the batch without changes. Runtime failures after mutation
begins are rethrown so the session's transaction port can restore the document.

### Read-only document access

`ChartDocumentReader` exposes PPQN, track descriptors, track lookup, note
snapshots, lyrics, and text events. Modes, projections, classification, and
preview computations read through this interface and do not mutate the MIDI.
Note lookup uses an indexed event-ID path rather than scanning all notes.

### Mode contract

An `EditingMode` declares:

- an ID and label;
- supported host kinds and the `appliesTo(track)` predicate;
- raw/domain command capabilities, entity kinds, track-creation permission,
  and difficulty requirements;
- tool descriptors and a validated tool-state schema/default;
- projection, classification, and pure command expansion.

Expansion validates and normalizes user intent and returns raw commands plus
rejections. The same expansion is used for preview and commit.

### Registry and resolution

Registration order is priority order. `resolve(track, hostKind)` returns the
first mode that applies to both. `canHost` is the single availability check.

| Mode          | Applies to                         | Host kinds   |
| ------------- | ---------------------------------- | ------------ |
| `vocals`      | Vocal track config                 | `piano-roll` |
| `chart.drums` | Drum role with difficulties        | `highway`    |
| `chart.frets` | Other instrument with difficulties | `highway`    |
| `midi.global` | Global track                       | `piano-roll` |
| `midi.raw`    | Instrument or unmapped MIDI track  | `piano-roll` |

A Piano Roll on a chart track is deliberately raw MIDI editing. Vocals are not
available in the Highway unless a future mode explicitly declares that host.

### Session and gesture

```ts
interface EditingSession {
  readonly mode: EditingMode;
  readonly target: EditingTarget;
  readonly hostKind: string;
  getProjection(): Projection;
  can(commandType: string): boolean;
  execute(command: EditCommand): EditResult;
  executeBatch(commands: readonly EditCommand[]): EditResult;
  beginGesture(): GestureHandle;
  getToolState(): unknown;
}

interface GestureHandle {
  preview(command: EditCommand): PreviewState;
  commit(): EditResult;
  cancel(): void;
  readonly isOpen: boolean;
}
```

Gestures follow one lifecycle in every view:

```text
beginGesture() → preview(command)* → commit()
                            └──────→ cancel()
```

Beginning a gesture does not open a history transaction. Preview replaces the
previous overlay and leaves the document untouched. Commit opens one
transaction, applies the last previewed command, records/ends it, refreshes
playback, and notifies subscribers. Cancel clears the overlay with no document,
history, or dirty-state trace. Discrete commands use `execute` directly.

### EditingService

`EditingService` is the only app bridge to history bracketing and post-edit
side effects. It owns the mode registry, global selection, clipboard, and
sessions keyed by viewport. It rebuilds sessions when the document, target,
difficulty, or view kind changes. Its transaction port maps to
`DocumentService`; successful commits refresh playback and publish the result.

### Required invariants

1. Mode expansion, classification, projection, and preview do not change MIDI
   output.
2. Gesture cancellation leaves MIDI bytes, history stacks, and dirty state
   unchanged.
3. A changed gesture creates exactly one history entry; an unchanged gesture
   creates none.
4. Rejected/failing batches never leave partial document changes.
5. Preview entity snapshots match committed snapshots, with pending IDs mapped
   to created IDs.
6. Entity-ID selection remains valid after undo and redo restore snapshots.
7. A command outside the session's capabilities is rejected as
   `unsupported-command` without changes.

## 4. Settled decisions

| ID   | Decision                                                                         | Rationale                                                              |
| ---- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| D-1  | Keep the kernel and modes in `@openchart/views/src/editing/`; add no package.    | Avoid package/dependency churn and build-order changes.                |
| D-2  | Preserve `note:<trackIndex>:<eventId>` and add prefixed IDs for other entities.  | IDs survive cloned snapshots; reordering/deletion is out of scope.     |
| D-3  | All gestures preview without mutation and commit once or cancel without a trace. | One consistent lifecycle and reliable cancellation.                    |
| D-4  | `EditingService` owns history and side effects.                                  | Avoid duplicate recording and component-owned playback refresh.        |
| D-5  | Use one global `SelectionModel` keyed by entity IDs; views filter by target.     | Supports undo/redo and cross-view selection.                           |
| D-6  | Clipboard payloads carry source mode and raw-pitch fallback.                     | Enables chart/raw interoperability while retaining same-mode fidelity. |
| D-7  | Resolve modes by `(track descriptor, host kind)` in registry priority order.     | Supports constrained chart editing and arbitrary MIDI editing.         |
| D-8  | Enforce constraints in pure mode expansion; preview uses that same expansion.    | Keeps preview and commit behavior aligned.                             |
| D-9  | Read chart semantics and special pitches from `TrackViewConfig`.                 | Removes duplicated pitch literals and app-level chart rules.           |
| D-10 | Global-track editing is the `midi.global` mode and migrates last.                | Keeps header changes separate from note-mode migration.                |
| D-11 | Keep snapshot-based undo.                                                        | Inverse-command history is not part of this work.                      |
| D-12 | Keep SCREAMING_SNAKE command discriminants; use `pitchDelta` for pitch changes.  | Avoids ambiguity between MIDI track and pitch.                         |
| D-13 | Put gesture-scoped mode memory in command data, not mutable mode state.          | Keeps modes pure and testable.                                         |
| D-14 | Migrate Piano Roll before Highway.                                               | The existing kernel path provides a lower-risk first host.             |

## 5. Human sign-off points

These decisions must not be silently changed:

- **S-1:** Global selection means selection in one viewport replaces selection
  shown in another.
- **S-2:** Cross-mode paste defaults to partial success with rejected entities
  reported to the user.
- **S-3:** No optional chart-aware raw Piano Roll mode is included.
- **S-4:** Adding strict boundary enforcement to CI requires maintainer
  agreement.
- **S-5:** Changes to existing `configs/default.json` values require sign-off;
  missing keys may be added and logged.
- **S-6:** Any user-visible behavior change outside the defect register
  requires sign-off.
