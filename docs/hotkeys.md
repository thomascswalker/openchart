# Hotkeys

Keyboard shortcuts are declared in one place, [`apps/editor/src/input`](../apps/editor/src/input),
and dispatched to `Action`s with [`@tanstack/react-hotkeys`](https://tanstack.com/hotkeys).
No component or view registers its own key listener. The generated reference
is in [Controls](../controls.md).

## Changing a hotkey

Edit the chord in the matching table and nothing else:

| File           | Scope       | Active when                              |
| -------------- | ----------- | ---------------------------------------- |
| `global.ts`    | `global`    | Always                                   |
| `highway.ts`   | `highway`   | The active viewport shows the Highway    |
| `pianoroll.ts` | `pianoroll` | The active viewport shows the Piano Roll |

```ts
"highway.set-tool#place": { hotkey: "W", args: ["place"], name: "Place tool", group: "Highway tools" },
```

The key is `actionId#variant`. The same row feeds menu and toolbar shortcut
labels (`useShortcutResolver`), `controls.md` (`npm run docs:controls`) and the
library's app-hotkey declarations, so one edit propagates everywhere.

## Overrides

View scopes are nested inside the root `global` scope. When both bind the same
chord, the active view's binding wins; chords the view does not bind fall
through to global. `src/input/__tests__/bindings.test.ts` lists every
intentional override (currently none), and `HotkeyScopes.test.tsx` pins the
library behaviour this relies on.

## Adding a hotkey

1. Add or reuse an `Action` in `src/actions` (the file path is the action id).
2. Add a row to the right table with `args` if the action takes any.
3. Choose a `target`: `document` (default) fires wherever focus is; `canvas`
   fires only while the active chart canvas has focus. Use `canvas` for keys that
   collide with focused widgets (arrows, Delete, digits).
4. Set `options: { requireReset: false }` only if the key should repeat while held.

Binding ids (`<scope>.<actionId>[.<variant>]`) are the keys of saved custom
hotkeys; renaming one resets that user override.

## Custom hotkeys

`InputProvider` passes `customHotkeys` (loaded from `localStorage`,
`openchart.hotkeys`) to the library and saves changes. There is no UI yet; a
Hotkey Editor can use the library's `useAppHotkeyList`, `useCustomHotkeys`
(`setCustomHotkey`, `findConflicts`, `resetCustomHotkey`) and `useHotkeyRecorder`.

## Not hotkeys

Widget-internal keys stay with their widgets: menu navigation, popup and form
Escape, and the vocal lyric field (Enter, Tab, Escape). Pointer-modifier handling
(Shift/Alt during drags) is also unchanged.
