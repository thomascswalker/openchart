# Unified Editing Framework Progress

## Phase 0: Baseline and guardrails (branch: editing/phase-0-baseline)

**Status:** done
**Summary:** Captured the existing build, type-check, lint, formatting, unit-test, E2E, and Storybook baseline before production changes. Added the report/strict editing-boundary checker with an allowlist matching the current 78 violations, plus JSON characterization fixtures and editor-side runners for current Highway and vocal behavior. Added this progress log and the living architecture reference. No production implementation behavior was changed.
**Files changed:**

- Root: `package.json` (editing-check scripts)
- Guardrails: `scripts/check-editing-boundaries.mjs`, `scripts/editing-boundaries.allowlist.json`
- Fixtures: `packages/views/tests/fixtures/characterization/editing.json`
- Editor tests: `apps/editor/src/components/views/highway/__tests__/characterization.test.ts`, `apps/editor/src/components/views/pianoRoll/__tests__/characterization.test.ts`
- Docs: `docs/editing/ARCHITECTURE.md`, `docs/editing/PROGRESS.md`
  **Tests:** added 7 characterization tests across 2 files · ported none · removed none
  **Gate results:** `npm ci` ✓ · MIDI/views builds ✓ · check-types ✓ (9 tasks) · lint ✓ · format:check baseline failure (153 files, unchanged) · test baseline failure (239 passed, 2 failed; 2 same pre-existing failures) · check:editing 78 violations / 10 files, all within the initial allowlist · check:editing:strict ✓ · E2E 15 passed / 3 pre-existing failures · Storybook not runnable: Node.js v20.18.1, while the installed Storybook requires Node.js v20.19+ or v22.12+.

### Phase 0 baseline details

- `npm ci` completed successfully. It emitted engine warnings because this environment runs Node.js v20.18.1; Vitest initially lacked the lockfile's optional Rolldown Windows binding. Installing that exact optional package into the local `node_modules` restored test execution without changing manifests or the lockfile.
- `npm run build --workspace=@openchart/midi` and `npm run build --workspace=@openchart/views` passed.
- `npm run check-types` passed (9 Turbo tasks); `npm run lint` passed.
- `npm run format:check` reports 153 existing files with style differences, including the existing root `package.json`; the newly added source, fixture, and docs files pass a targeted Prettier check.
- `npm test` reports 239 passed and 2 failed across the editor's 45 files. The same two failures reproduced before adding characterization tests:
  - `highway/__tests__/noteEditing.test.ts`: fake chart lacks `getTrack`.
  - `pianoRoll/__tests__/pianoRoll.test.ts`: `iterateGridBeats` reads an undefined time-signature event.
- `npm run test:e2e --workspace=@openchart/editor` reports 15 passed and 3 failed. The failures are the existing `playhead-sync` T2/T3 camera-tick and camera-reframe assertions; runtime logs also include the existing undefined time-signature `tick` error. Storybook build is blocked by the installed Node.js version.
- The initial boundary report is 78 occurrences across 10 files: Highway `noteEditing.ts` 14, `phraseEditing.ts` 4, `input/input.ts` 3; Piano Roll `controllers/header.ts` 15, `editing/context.ts` 1, `editing/generic.ts` 6, `editing/vocal.ts` 13, `editingStrategy.ts` 8, `index.ts` 1, and `vocalEditing.ts` 13. The report and strict checker both show every count within its allowance.
  **Defects closed:** none
  **Intentional behaviour changes:** none
  **Deviations from plan:** The pre-existing full-suite failures are recorded as baseline failures; no unrelated fixes were made. The characterization runner exercises current app controllers and `@openchart/views` helpers using the existing fake-context patterns.
  **Performance:** not measured in Phase 0
  **Open questions:** none

## Phase 1: Dead code and naming cleanup (branch: editing/phase-1-dead-code-and-naming-cleanup)

**Status:** done
**Summary:** Removed the five-file orphaned Piano Roll editing layer after repository-wide importer searches found no consumers. Aligned the Piano Roll strategy ID type with `PianoRollEditingType`, renamed the vocal strategy ID to `"vocals"`, and updated its track-creation check. Fixed `TrackList` hook ordering and stale `SongView` memoization, introduced/exported `EditingModeId`, and marked the Phase 10 removals as deprecated.
**Files changed:**

- Editor: `apps/editor/src/components/dialogs/TrackList/{TrackList.tsx,TrackList.test.tsx}`, `apps/editor/src/components/views/pianoRoll/{controllers/noteEditing.ts,editingStrategy.ts,vocalEditing.ts}`; removed `pianoRoll/editing/{context,controller,generic,types,vocal}.ts`
- Views: `packages/views/src/{index.ts,chartEditing.ts}`, `packages/views/src/editing/{mode.ts,chartDocument.ts,clipboardService.ts}`
- Guardrails: `scripts/editing-boundaries.allowlist.json`
- Docs: `docs/editing/PROGRESS.md`
  **Tests:** added `TrackList.test.tsx` for hook-order and document-change regression · ported none · removed none
  **Gate results:** MIDI/views builds ✓ · check-types ✓ (9 tasks) · lint ✓ · targeted Prettier ✓ · full format:check baseline failure (148 files; down from 153 after deleting unformatted dead code) · `npm test`: 239 passed, same 2 pre-existing failures; its failure short-circuits the later TSX suite · focused TrackList TSX test ✓ · check:editing 78 → 58 violations (orphaned files' 20 removed; strict ✓) · e2e 15 passed / same 3 baseline failures · Storybook not rerun: still blocked by the recorded Node.js version.
  **Defects closed:** DEF-12 (TrackList hook order and stale SongView memoization; regression test: `TrackList keeps hooks stable and rebuilds its SongView when the document changes`)
  **Intentional behaviour changes:** none
  **Deviations from plan:** Added `TrackList.test.tsx` outside the explicit Phase 1 file list as the focused regression test required for DEF-12.
  **Performance:** not measured in Phase 1
  **Open questions:** none

## Phase 2: MIDI editing primitives (branch: editing/phase-2-midi-primitives)

**Status:** done
**Summary:** Added absolute-tick `MidiTrack.addNoteAt`, atomic note `updateNote`, and O(1) event-ID and note-ID indexes. Migrated note insertion and combined move operations to these primitives while preserving event ordering and stale `MidiNote` snapshot behavior.
**Files changed:**

- MIDI: `packages/midi/src/track.ts`, `packages/midi/tests/__tests__/midi.test.ts`
- Views: `packages/views/src/{chartEditing.ts,chartView.ts,vocals.ts}`, `packages/views/src/editing/chartDocument.ts`, `packages/views/tests/__tests__/chartEditing.test.ts`
- Editor: `apps/editor/src/components/views/{highway/editing/noteEditing.ts,highway/__tests__/noteEditing.test.ts,pianoRoll/editingStrategy.ts,pianoRoll/.storybook/createPianoRollFixture.ts}`
- Guardrails: `scripts/editing-boundaries.allowlist.json`
- Docs: `docs/editing/PROGRESS.md`
  **Tests:** added 4 MIDI tests for absolute insertion, indexed lookup, clone/removal ID stability, one-revision atomic updates, and validation atomicity · ported the phrase-update rejection test to the atomic `updateNote` API, preserving its no-change assertion · updated the Highway test double for `addNoteAt` · removed none
  **Gate results:** MIDI/views builds ✓ · check-types ✓ (9 tasks) · lint ✓ · targeted Prettier ✓ · full format:check baseline failure (145 files; down from 148 after Phase 1) · `npm test`: 239 passed, 2 same pre-existing failures · MIDI tests 27 passed · views tests 32 passed · strict editing boundary check 57 violations (down from 58; strict ✓; Piano Roll strategy allowance 8 → 7) · focused Highway/vocal characterization tests passed; Highway noteEditing retains 1 pre-existing `chart.getTrack` failure · e2e 15 passed / same 3 baseline `playhead-sync` failures · Storybook not rerun: remains blocked by the recorded Node.js version.
  **Defects closed:** none
  **Intentional behaviour changes:** none
  **Deviations from plan:** Ported the phrase-update failure test to simulate rejection of the new atomic update operation; its assertion that the phrase remains unchanged is preserved. Updated the existing Highway test double to match the new absolute insertion API.
  **Performance:** Event and note ID lookups now use maps; no performance benchmark run.
  **Open questions:** none

### Phase 2 follow-up: close MIDI primitive contract gaps

**Status:** done · branch: `editing/phase-2-midi-primitives`
**Summary:** Aligned the public primitive API with the Phase 2 contract: `addNoteAt` takes `AddNoteSpec` and returns the indexed `MidiNote`; `updateNote` accepts `NotePatchFields` (`start`, `pitch`, `duration`, `velocity`); missing note IDs return `undefined`. Updated scoped callers and test doubles. Added the required legacy/new API byte-parity test, including equal-tick events and EndOfTrack, plus regression tests proving clamped group moves preserve duration.
**Files changed:** MIDI types, exports, implementation and tests; the previously listed `@openchart/views` insertion/move callers and tests; Piano Roll/Highway insertion callers and the Highway test double; this progress log.
**Tests:** MIDI 29 passed; views 34 passed; added byte parity, channel validation, and tick-zero duration-clamp regressions. No existing assertions were removed or weakened.
**Gate results:** MIDI/views builds ✓ · check-types ✓ · lint ✓ · touched-file Prettier ✓ · full format:check baseline failure (145 files; no touched files reported) · full `npm test`: 239 passed, the same 2 pre-existing editor failures · check:editing 57 violations, all within allowance; strict ✓ · E2E 15 passed / 3 existing `playhead-sync` failures · Storybook remains blocked by Node.js v20.18.1 (installed Storybook requires v20.19+ or v22.12+).
**Defects closed:** none
**Intentional behaviour changes:** none; the zero-tick clamp now preserves the note's original duration, consistent with `setNoteStart`.
**Deviations from plan:** This follow-up completes the Phase 2 `AddNoteSpec`/`NotePatchFields` shape and byte-parity exit criterion, which were not met by the original Phase 2 commit.
**Performance:** no performance benchmark run.
**Open questions:** none

## Phase 3: Kernel v2 (branch: editing/phase-3-kernel-v2)

**Status:** done
**Summary:** Added stable entity ID formatting/parsing, the raw command v2 vocabulary, structured results and rejection errors, a read-only document reader, and pure note-preview computation. `ChartDocument` now applies and preflights batches of note, text, tempo, and time-signature commands, returns affected IDs, and resolves notes through the MIDI event-ID index. The deprecated action path remains available through `applyLegacy` for `TransactionManager`; the Piano Roll move caller now supplies `pitchDelta`.
**Files changed:**

- Views: `packages/views/src/editing/{action.ts,chartDocument.ts,clipboardService.ts,commands.ts,entityId.ts,preview.ts,reader.ts,result.ts,scratchpad.ts,selectionModel.ts,transactionManager.ts}`, `packages/views/src/index.ts`
- Views tests: `packages/views/tests/__tests__/editing.test.ts`
- Editor: `apps/editor/src/components/views/pianoRoll/controllers/noteEditing.ts`
- Editor test adaptation: `apps/editor/src/components/views/pianoRoll/__tests__/vocals.test.ts`
- Docs: `docs/editing/PROGRESS.md`
  **Tests:** added coverage for entity IDs, legacy-action upgrades, note commands and results, preflight atomicity, text/tempo/time-signature commands, and pure preview parity · ported the Piano Roll vocal test helper to `applyLegacy` while preserving its behavior assertions · removed none
  **Gate results:** MIDI/views builds ✓ · check-types ✓ (9 tasks) · lint ✓ · targeted Prettier ✓ · full format:check fails on 158 repository files (153 in Phase 0 baseline; no Phase 3 source/test files are among the reported files) · `npm test`: 239 passed, 2 same baseline failures (`ChartView.getTrack` test double and Piano Roll time-signature fixture) · focused kernel/service/vocal tests 36 passed · check:editing 57 violations, all within allowance; strict ✓ · E2E 15 passed / same 3 baseline `playhead-sync` failures · Storybook build and test cannot run with Node.js v20.18.1; installed Storybook requires v20.19+ or v22.12+.
  **Defects closed:** DEF-09 (Piano Roll move commands use `pitchDelta`); DEF-15 (note-ID resolution uses the MIDI event-ID index)
  **Intentional behaviour changes:** none
  **Deviations from plan:** Updated `vocals.test.ts` outside the enumerated Phase 3 app paths to route its deprecated-API fixture through `applyLegacy`; its MIDI output and behavior assertions are unchanged. Added TSDoc to the existing exported clipboard, scratchpad, selection, and transaction APIs as required by the kernel API documentation contract.
  **Performance:** Note-ID resolution uses the O(1) event-ID index; no timing benchmark run.
  **Open questions:** none

## Phase 4: Mode framework and EditingService (branch: editing/phase-4-mode-framework)

**Status:** done
**Summary:** Added the mode contracts and registration-order registry, shipped the `midi.raw` Piano Roll mode, and introduced editing sessions with preview/commit/cancel gestures. Added standalone editing with snapshot history and configured-track materialization. Reworked the editor bridge as `EditingService`; sessions are cached per viewport and invalidated when the document or viewport target changes, successful commits refresh playback and publish edit results. Routed the generic Piano Roll command and gesture commits through sessions while keeping its existing scratchpad preview and one-undo-step gesture behavior.
**Files changed:**

- Views: `packages/views/src/editing/{chartDocument.ts,mode.ts,modeRegistry.ts,session.ts,standalone.ts,modes/{index.ts,rawMidi.ts}}`, `packages/views/src/index.ts`
- Views tests: `packages/views/tests/__tests__/editing/session.test.ts`
- Editor: `apps/editor/src/{bootstrap.ts,components/editor/Viewport/index.tsx,components/views/pianoRoll/{index.ts,types.ts,controllers/noteEditing.ts},services/editor/editing.ts}`
- Editor tests: `apps/editor/src/components/views/pianoRoll/__tests__/vocals.test.ts`, `apps/editor/src/services/editor/__tests__/editing.test.ts`
- Docs: `docs/editing/PROGRESS.md`
  **Tests:** added mode-priority and raw-mode tests, gesture invariants I-1/I-2/I-3/I-4/I-7, post-commit error handling, and configured-track creation/rollback coverage · added a generic Piano Roll gesture test asserting one undo entry and an editor-service gesture test asserting one undo step plus playback refresh · no tests removed or weakened
  **Gate results:** MIDI/views builds ✓ · check-types ✓ (9 tasks) · lint ✓ · touched-file Prettier ✓ · full format:check reports 157 repository files (Phase 0 baseline: 153; all Phase 4 files pass targeted Prettier) · `npm test`: 358 passed and the same 2 Phase 0 editor failures (`ChartView.getTrack` test double and Piano Roll time-signature fixture) · focused session/Piano Roll/service tests 33 passed · check:editing 57 violations, all within allowance; strict ✓ · E2E 15 passed / the same 3 `playhead-sync` failures · Storybook blocked: installed version requires Node.js v20.19+ or v22.12+, environment has v20.18.1.
  **Defects closed:** DEF-05 (generic session commits no longer trigger a duplicate `notifyNotesChanged`; service refresh is verified after a gesture commit)
  **Intentional behaviour changes:** none
  **Deviations from plan:** Changed `bootstrap.ts` to import the renamed `EditingService` as a type because `EditorEditingService` is now a deprecated type alias; this one-line out-of-scope adjustment is required by the Phase 4 class rename and has no runtime behavior change.
  **Performance:** no benchmark run; Phase 4 does not introduce an entity-resolution complexity change.
  **Open questions:** none

## Phase 5: Domain modes (branch: editing/phase-5-domain-modes)

**Status:** done
**Summary:** Added config-driven chart and vocal domain modes, moved shared chart semantics into `@openchart/views`, and re-exported Highway profile and sustain helpers for compatibility. `ChartView.moveNote` now uses atomic `updateNote`; default mode resolution and fixture behavior are covered by tests.
**Files changed:**

- Views config/chart semantics: `packages/views/src/{config.ts,chartView.ts,vocals.ts,chart/{constants,drums,forcedNotes,sustains}.ts}`
- Views modes: `packages/views/src/editing/{modes/{common,chartFrets,chartDrums,vocals,index}.ts,session.ts,standalone.ts}`, `packages/views/src/index.ts`
- Views tests: `packages/views/tests/__tests__/{config,chartView,domainModes}.test.ts`
- Editor compatibility: `apps/editor/src/components/views/highway/{profile.ts,interaction.ts}`, `apps/editor/src/components/views/pianoRoll/profile.ts`
- Docs: `docs/editing/PROGRESS.md`
  **Tests:** all 14 Phase 0 characterization/domain-mode tests pass; full views suite 64 passed; focused editor characterization tests 28 passed · ported none · removed none
  **Gate results:** MIDI build ✓ · views build ✓ · check-types ✓ (9 Turbo tasks) · lint ✓ · targeted Prettier ✓ for every Phase 5 file · full format:check reports 155 files (153 in Phase 0 baseline; no Phase 5 files are reported) · `npm test`: 240 passed, 2 same pre-existing Phase 0 failures (`highway/noteEditing.test.ts` fake chart lacks `getTrack`; Piano Roll grid test reads an undefined time-signature event) · check:editing:strict ✓ (57 violations, all within existing allowances) · E2E 15 passed / same 3 baseline `playhead-sync` failures · Storybook build and interaction tests blocked because installed Storybook requires Node.js v20.19+ or v22.12+, while the environment has v20.18.1.
  **Defects closed:** DEF-06 (drum-note movement preserves kind and Kick2); DEF-07 (atomic chart note movement); DEF-08 (forced-marker placement rejects missing config instead of using pitch 104); DEF-10 (vocal phrase overlap checks live in the mode)
  **Intentional behaviour changes:** Missing forced-marker configuration now rejects with `missing-config-note`, replacing the legacy pitch-104 fallback (DEF-08).
  **Deviations from plan:** The user approved adding `apps/editor/src/components/views/pianoRoll/profile.ts` to the Phase 5 scope as required by task 5.7. `midi.global` remains deferred to Phase 9 as specified by the plan.
  **Performance:** not measured in Phase 5
  **Open questions:** none

## Phase 6: Piano Roll migration (branch: editing/phase-6-piano-roll-migration)

**Status:** done
**Summary:** Replaced the Piano Roll strategy/core path with `EditingSession` gestures for raw MIDI and vocals. Note move, resize, create, erase, delete, clipboard, selection projection, and preview rendering now use session commands and stable IDs. The Storybook host uses standalone editing and the vocal lyric prompt keeps creation preview-only until commit; pointer cancellation cancels the gesture. Removed `editingStrategy.ts` and `vocalEditing.ts`.
**Files changed:**

- Editor: Piano Roll controllers, input, view, profile, selection, rendering, types, Storybook host, tests, and `apps/editor/e2e-storybook/piano-roll.spec.ts`; `AbstractChartView.tsx`; `Viewport/index.tsx`; `Runtime/index.tsx`; `services/editor/editing.ts`
- Views kernel: `editing/{clipboardService.ts,session.ts,standalone.ts}`
- Docs: `docs/editing/PROGRESS.md`
  **Tests:** migrated session-based Piano Roll vocal/characterization tests (25 passed); Piano Roll tests excluding the recorded grid baseline failure (12 passed); views package (64 passed) · no tests removed or weakened
  **Gate results:** MIDI/views builds ✓ · check-types ✓ (9 tasks) · repository lint ✓ · targeted Prettier ✓ (header excluded by plan; only its profile-id check changed) · full format:check baseline failure (148 files; Phase 0 baseline 153) · `npm test`: 243 passed, 2 same Phase 0 failures (`highway/noteEditing.test.ts` fake chart lacks `getTrack`; Piano Roll grid test reads an undefined time-signature event) · check:editing:strict ✓ (36 violations: 21 Highway and 15 header, all within allowance; no other Piano Roll violations) · E2E 15 passed / same 3 baseline `playhead-sync` failures · Storybook build and Piano Roll Storybook E2E not runnable because Storybook requires Node.js v20.19+ or v22.12+, while the environment has v20.18.1.
  **Defects closed:** DEF-02 (vocal create cancellation has no mutation trace); DEF-11 (selection resolution is ID-based and subscription is not rebound on each update)
  **Intentional behaviour changes:** note gestures preview without mutating MIDI and commit as a single session transaction; pointer cancellation cancels instead of committing.
  **Deviations from plan:** `Runtime/index.tsx` was updated so the vocals action condition follows the session mode after strategy removal. The three `packages/views/src/editing/*` changes provide interim vocal lyric clipboard payloads, standalone history event support, and session behavior required by the Piano Roll migration. `controllers/header.ts` is excluded until Phase 9 and was changed only to check the renamed `"vocals"` profile ID; its existing history/callback bridge remains for header edits.
  **Performance:** not measured in Phase 6
  **Open questions:** none. The user approved keeping the legacy header callback bridge as a temporary exception until its planned Phase 9 migration.

  ## Phase 7: Highway migration (branch: editing/phase-7-highway-migration)

  **Status:** done
  **Summary:** Bound Highway editing to `EditingSession`, resolved the active target through the session, and moved note and phrase previews, commits, deletes, and clipboard operations onto session commands. Highway rendering and hit testing now project session classification, preview overlays, and stable entity IDs; selection survives undo/redo. Cancelled note drags leave MIDI and history unchanged, and playback start interrupts input gestures.
  **Files changed:**

  - Editor: `apps/editor/src/components/views/highway/**`; removed `highway/selection.ts`
  - Views kernel: `packages/views/src/editing/{session.ts,modes/{chartDrums,chartFrets}.ts}` and `packages/views/tests/__tests__/editing/session.test.ts`
  - Docs: `docs/editing/PROGRESS.md`
    **Tests:** Highway unit suite 79 passed; Highway input TSX suite 14 passed; views package 64 passed; focused Highway instancing E2E 4 passed. Updated Highway tests to assert centralized ID selection and the current note argument shape; added a playback-start cancellation test and completed the missing physical-lane test setup. No tests were removed or weakened.
    **Gate results:** MIDI/views builds ✓ · check-types ✓ (9 tasks) · repository lint ✓ · targeted Prettier ✓ · full format:check reports 131 pre-existing repository files with formatting differences (Phase 0 baseline: 153; all Phase 7 files pass targeted Prettier) · `npm test`: 240 passed / 1 pre-existing Piano Roll time-signature fixture failure; full run stops before the subsequent TSX suite, which was run separately and passed · check:editing:strict ✓ (15 violations, all in the approved Piano Roll header allowance; zero Highway violations) · editor E2E 15 passed / 3 same baseline `playhead-sync` failures · Storybook remains blocked by the installed Node.js requirement (20.19+ or 22.12+; environment 20.18.1).
    **Defects closed:** DEF-01 (cancelled Highway drag has no mutation/history trace; playback-start interruption covered); DEF-03 (selection uses stable IDs and survives undo/redo); DEF-06 (Highway drum-kind rendering and classification use the session mode).
    **Intentional behaviour changes:** Highway drag previews no longer mutate MIDI before commit; Highway phrase and note selections share the central selection model and survive undo/redo.
    **Deviations from plan:** `HighwayNoteEditingController` remains as a session-command/gesture adapter rather than being folded into the input controller; it performs no direct MIDI mutations and keeps placement, clipboard, and selection commands separate from pointer-state handling. `HighwayPhraseEditingController` likewise remains as a gesture adapter over session commands. The approved Piano Roll header callback bridge remains until Phase 9. Changes to `packages/views` extend preview placement with an end tick and expose mode classification required by Highway projection; these are outside the listed app-only scope but necessary for held-note previews and mode-based indexing.
    **Performance:** Highway instancing E2E recorded 3,000 visible notes, capacity 4,096, zero dropped notes, 1.700 ms draw, 0.100 ms instance-buffer writes, and no note-state rebuild on the unchanged frame. Drag preview/cancel behavior is covered by input tests; no separate active-drag timing comparison was captured.
    **Open questions:** none

## Phase 8: Clipboard and selection centralization (branch: editing/phase-8-clipboard-selection)

**Status:** done
**Summary:** Replaced the view-owned clipboard with one defensive, mode-tagged payload shared by editor sessions. Added mode-specific paste expansion for raw MIDI, frets, drums, and vocals, including cross-view pitch validation, Kick2 preservation, and vocal lyric restoration. Routed copy, cut, paste, menu enablement, playback gating, and rejection-count errors through `EditorClipboardService`; cut is one session transaction. Removed view-local clipboard methods and verified shared selection replacement across viewport sessions.
**Files changed:**

- Views: `packages/views/src/editing/{clipboard.ts,clipboardService.ts,mode.ts,session.ts,standalone.ts,modes/{rawMidi,chartFrets,chartDrums,vocals}.ts}`, `packages/views/src/index.ts`
- Editor services: `apps/editor/src/services/editor/{clipboard.ts,editing.ts,__tests__/{clipboard,editing}.test.ts}`
- Editor views/tests: Highway and Piano Roll clipboard APIs removed; migrated characterization/note/vocal tests and the Piano Roll Storybook hotkey adapter
- Docs: `docs/editing/PROGRESS.md`
  **Tests:** added 8 editor clipboard integration tests covering cross-view paste, validation/rejection reporting, lyric and Kick2 preservation, cut undo, playback enablement, and shared viewport selection · ported the legacy clipboard test and view tests to the session payload API while retaining MIDI output and lyric assertions · removed none
  **Gate results:** MIDI/views builds ✓ · check-types ✓ (9 Turbo tasks) · lint ✓ · targeted Prettier ✓ · full format:check reports 129 repository files; all Phase 8 files pass · `npm test`: 382 passed / 1 pre-existing editor Piano Roll time-signature fixture failure · Menubar 5 passed; focused editor unit suites 52 passed; views suite 64 passed · check:editing:strict ✓ (15 violations, all within the approved Piano Roll header allowance; no clipboard code remains in production views) · E2E 15 passed / the same 3 baseline `playhead-sync` failures · Storybook unavailable: installed Storybook requires Node.js v20.19+ or v22.12+, environment v20.18.1.
  **Defects closed:** DEF-04 (cross-view clipboard and focused-view-dependent menu enablement; tests: editor clipboard integration and Menubar)
  **Intentional behaviour changes:** Cross-mode paste now validates entities against the destination mode and reports dropped-note counts; paste remains enabled across view modes when a shared payload exists (DEF-04).
  **Deviations from plan:** The standalone Piano Roll Storybook host omits clipboard hotkeys because it has no editor-level clipboard service; clipboard logic was not reintroduced into the view.
  **Performance:** not applicable
  **Open questions:** none
