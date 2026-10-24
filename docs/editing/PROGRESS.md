# Unified Editing Framework Progress

## Phase 0: Baseline and guardrails  (branch: editing/phase-0-baseline)
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
