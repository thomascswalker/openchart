# Adding an editing mode

An `EditingMode` is the source of truth for a track's editing capabilities. It
defines which hosts can edit the track, the commands and entities it supports,
its toolbar tools and validated tool state, and the projection and
classification used by views.

The Phase 9 acceptance test is the worked example:
[`mode-extensibility.test.ts`](../../apps/editor/src/services/editor/__tests__/mode-extensibility.test.ts).
Its `test.fourLane` mode is registered at runtime and exercises toolbar
generation, context keys, command execution, clipboard use, and gesture
cancel/commit/undo without changing an existing production mode or view.

## Steps

1. **Define the mode in `@openchart/views`.** Add a file under
   `packages/views/src/editing/modes/` and implement `EditingMode<TToolState>`.
   Give it a stable ID and label, declare `hostKinds`, and make `appliesTo`
   depend on the supplied `TrackDescriptor` (`track.kind`, `track.rules`), not
   an app-level instrument-name check.
2. **Declare capabilities and tools.** List supported raw and domain command
   types and entity kinds. Set track-creation and difficulty requirements.
   Describe toolbar items with IDs, labels, icon keys, groups, state keys,
   values, and optional action/shortcut metadata by implementing
   `createTools(context)`; tools may depend on the target track's rules. Define a Zod
   `toolStateSchema` and a valid default state.
3. **Implement projection and classification.** Map note snapshots to the
   mode's rows and rows back to MIDI pitches. Classify projected entities so
   move, resize, selection, and clipboard behavior use the same semantics.
4. **Expand domain commands.** Rule enforcement happens after expansion in the
   session; do not re-implement ruleset constraints in the mode (call
   `context.validate(commands)` if you need a dry run).
   Validate domain intent in `expand`, return
   errors as rejections, and translate accepted operations into raw commands.
   `ChartDocument` validates the raw commands before mutation. Keep this logic
   pure: do not mutate a `MidiTrack`, read editor services, or import app code.
5. **Implement clipboard expansion.** `expandPaste` receives a defensive,
   mode-tagged payload. Map source entities to the destination's rows and
   commands; report unsupported entities as rejections instead of silently
   changing their meaning.
6. **Register the mode.** Add production modes to the appropriate registration
   list in `packages/views/src/editing/modes/index.ts`. Registration order is
   priority order, so specific modes must precede broader modes such as
   `midi.raw`.
7. **Add tests.** Cover descriptor resolution, host availability, tool-state
   schema validation, projection/classification, accepted and rejected
   commands, clipboard conversion, preview purity, and undoable commit. Use
   the four-lane acceptance test as the end-to-end template.
8. **Update documentation and verify boundaries.** Describe the mode's
   behavior in the Views docs and architecture reference. Run the Views tests,
   build the Views package before checking the editor, and run
   `npm run check:editing:strict`.

## Minimal shape

The mode must satisfy the complete interface; this sketch shows the central
declarations rather than a substitute implementation:

```ts
import { DomainCommandType, EditCommandType } from "@openchart/views";

const mode: EditingMode<ToolState> = {
  id: "chart.example",
  label: "Example",
  hostKinds: new Set(["example-view"]),
  appliesTo: (track) => track.kind === "guitar",
  capabilities: {
    rawCommands: new Set([EditCommandType.DeleteEntities]),
    domainCommands: new Set([DomainCommandType.PlaceChartNote]),
    entityKinds: new Set(["note"]),
    canCreateTrack: false,
    requiresDifficulty: true,
  },
  createTools: () => [],
  toolStateSchema,
  createDefaultToolState: () => defaultToolState,
  createProjection,
  classify,
  expandPaste,
  expand,
};
```

Do not add editor toolbar conditionals or mirrored tool fields for a mode.
The mode registry, toolbar, and context keys consume the descriptor.
