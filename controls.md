# Controls

## Keyboard

Every keyboard shortcut is declared in
[`apps/editor/src/input`](apps/editor/src/input) (`global.ts`, `highway.ts`,
`pianoroll.ts`). `Ctrl/Cmd` means Ctrl on Windows/Linux and Cmd on macOS.
Highway and Piano Roll hotkeys override a global hotkey with the same key while
that view is active. Hotkeys marked as canvas-targeted (arrows, number keys,
Delete, ...) only fire while the chart canvas has focus.

<!-- hotkeys:start -->

> Generated from `apps/editor/src/input` by `npm run docs:controls`. Edit the binding tables, not this block.

### Global

| Hotkey                     | Description                  | Group    |
| -------------------------- | ---------------------------- | -------- |
| **`Space`**                | Play/pause                   | Playback |
| **`M`**                    | Toggle metronome             | Playback |
| **`N`**                    | Toggle highway clap          | Playback |
| **`P`**                    | Toggle vocal pitch feedback  | Playback |
| **`Ctrl/Cmd + N`**         | New project                  | File     |
| **`Ctrl/Cmd + O`**         | Open project                 | File     |
| **`Ctrl/Cmd + S`**         | Save                         | File     |
| **`Ctrl/Cmd + Shift + S`** | Save as                      | File     |
| **`Ctrl/Cmd + ,`**         | Open settings                | File     |
| **`Escape`**               | Close dialog                 | File     |
| **`Ctrl/Cmd + Z`**         | Undo                         | Edit     |
| **`Ctrl/Cmd + Y`**         | Redo                         | Edit     |
| **`Ctrl/Cmd + Shift + Z`** | Redo (alternate)             | Edit     |
| **`Ctrl/Cmd + X`**         | Cut                          | Edit     |
| **`Ctrl/Cmd + C`**         | Copy                         | Edit     |
| **`Ctrl/Cmd + V`**         | Paste                        | Edit     |
| **`Delete`**               | Delete selection             | Edit     |
| **`Backspace`**            | Delete selection (alternate) | Edit     |

### Highway

| Hotkey           | Description                           | Group         |
| ---------------- | ------------------------------------- | ------------- |
| **`Q`**          | Select tool                           | Highway tools |
| **`W`**          | Place tool                            | Highway tools |
| **`E`**          | Remove tool                           | Highway tools |
| **`R`**          | Stagepower phrase tool                | Highway tools |
| **`T`**          | Solo phrase tool                      | Highway tools |
| **`1`**          | Toggle lane 1 note                    | Highway       |
| **`Shift + 1`**  | Toggle lane 1 note (preserve sustain) | Highway       |
| **`2`**          | Toggle lane 2 note                    | Highway       |
| **`Shift + 2`**  | Toggle lane 2 note (preserve sustain) | Highway       |
| **`3`**          | Toggle lane 3 note                    | Highway       |
| **`Shift + 3`**  | Toggle lane 3 note (preserve sustain) | Highway       |
| **`4`**          | Toggle lane 4 note                    | Highway       |
| **`Shift + 4`**  | Toggle lane 4 note (preserve sustain) | Highway       |
| **`5`**          | Toggle lane 5 note                    | Highway       |
| **`Shift + 5`**  | Toggle lane 5 note (preserve sustain) | Highway       |
| **`Up`**         | Move forward                          | Highway       |
| **`Down`**       | Move backward                         | Highway       |
| **`Left`**       | Decrease snap interval                | Highway       |
| **`Right`**      | Increase snap interval                | Highway       |
| **`Alt + Up`**   | Next section                          | Highway       |
| **`Alt + Down`** | Previous section                      | Highway       |
| **`]`**          | Next section (alternate)              | Highway       |
| **`[`**          | Previous section (alternate)          | Highway       |

### Piano Roll

| Hotkey             | Description              | Group      |
| ------------------ | ------------------------ | ---------- |
| **`Up`**           | Transpose up             | Piano roll |
| **`Down`**         | Transpose down           | Piano roll |
| **`Shift + Up`**   | Transpose up an octave   | Piano roll |
| **`Shift + Down`** | Transpose down an octave | Piano roll |
| **`Left`**         | Move earlier             | Piano roll |
| **`Right`**        | Move later               | Piano roll |
| **`Ctrl/Cmd + A`** | Select all               | Piano roll |
| **`Ctrl/Cmd + D`** | Clear selection          | Piano roll |
| **`F`**            | Focus selection          | Piano roll |
| **`R`**            | Stagepower phrase tool   | Vocals     |
| **`T`**            | Vocal phrase tool        | Vocals     |
| **`Y`**            | Power window tool        | Vocals     |

<!-- hotkeys:end -->

## Lyric input (Piano Roll, vocals)

These keys belong to the lyric text field, not the hotkey system.

| Key          | Context               | Description                           |
| ------------ | --------------------- | ------------------------------------- |
| **`Enter`**  | Lyric input           | Commit lyric                          |
| **`Escape`** | Lyric input, new note | Remove the new note                   |
| **`Tab`**    | Lyric input           | Commit and edit the next note's lyric |

## Mouse

### Piano Roll

| Action           | Context              | Description        |
| ---------------- | -------------------- | ------------------ |
| **`LMB + Drag`** |                      | Add note           |
| **`LMB + Drag`** | Mouse over note      | Move note(s)       |
| **`LMB + Drag`** | Mouse over note edge | Modify note length |
| **`RMB + Drag`** |                      | Marquee select     |

### Piano Roll, vocals

See [Vocals](docs/vocals.md) for the full editing model.

| Action           | Context     | Description                              |
| ---------------- | ----------- | ---------------------------------------- |
| **`LMB + Drag`** | Grid        | Add note of the selected type            |
| **`LMB + Drag`** | Pinned lane | Add phrase, percussion or pitchless note |

### Highway

| Action            | Context             | Description                 |
| ----------------- | ------------------- | --------------------------- |
| **`LMB`**         | Place tool          | Add note                    |
| **`LMB`**         | Place tool, sustain | Add note + trim sustain     |
| **`LMB + Shift`** | Place tool, sustain | Add note + preserve sustain |
| **`LMB + Drag`**  | Place tool, sustain | Resize sustain              |
| **`LMB + Drag`**  | Select tool, note   | Move note(s)                |
| **`LMB + Drag`**  | Select tool, blank  | Marquee select              |
| **`RMB + Drag`**  | Select tool, note   | Move sustain                |
