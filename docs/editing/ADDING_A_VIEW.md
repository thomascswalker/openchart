# Adding an editing view

An editing view is a projection plus a gesture adapter. It reads an
`EditingSession`, renders the session's mode-specific projection and preview,
and commits or cancels commands. It does not mutate MIDI or bracket history.

The Phase 9 test-only view host is represented by `"test-view"` in
[`mode-extensibility.test.ts`](../../apps/editor/src/services/editor/__tests__/mode-extensibility.test.ts).
That test registers `test.fourLane`, requests a session for the test mode, and
exercises the generated tools and session lifecycle. It demonstrates that the
mode contract does not require edits to the existing Piano Roll or Highway
implementation.

## Steps

1. **Choose a host kind.** The mode must declare that host in `hostKinds`.
   Production hosts are typed and rendered by the editor viewport. A
   test-only host can be an arbitrary string, as in the Phase 9 acceptance
   test.
2. **Resolve the session.** Production views receive the active session from
   the viewport. The session binds the current track, difficulty, mode, and
   host. For a test-only mode, register the mode in `EditingService.registry`
   and request it by ID, as the acceptance test does.
3. **Render from projections.** Read visible rows through
   `session.getProjection()`, and classify note snapshots with
   `session.classifyNote()`. Render `PreviewState` as an overlay; never write
   preview data into the MIDI document.
4. **Use mode-owned tool state.** Read state with `session.getToolState()`.
   Production tool changes should go through
   `EditingService.updateToolState(viewportId, modeId, update)`, which merges
   and validates the mode's schema. Do not add a view-local copy of tool
   fields.
5. **Implement gestures with one lifecycle.** On pointer-down, call
   `session.beginGesture()`. Send replacement commands to `preview()` during
   movement. Call `commit()` once on successful completion; call `cancel()` on
   pointer cancellation, Escape, teardown, or interrupted interaction. Use
   `session.execute()` for discrete edits.
6. **Share selection and clipboard.** Store stable entity IDs in
   `session.selection`; use the shared `session.clipboard` and
   `session.pasteClipboard()`. Do not keep object-reference selections or a
   view-owned clipboard.
7. **Wire a production host.** Add the host to the editor's viewport-kind and
   rendering adapter, then ensure the mode advertises it. Availability is
   checked by `ModeRegistry.canHost`, not by track-name conditionals.
8. **Test the contract.** Verify preview does not mutate, cancel creates no
   history, commit creates one undo step, selection survives snapshots, and
   clipboard data works across hosts. The test-only four-lane mode provides a
   small acceptance fixture for these interactions.

The app-level editing rules are documented in
[the architecture reference](./ARCHITECTURE.md). Run the editor type-check and
`npm run check:editing:strict` after changing a production view.
