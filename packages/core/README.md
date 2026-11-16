# @openchart/core

Reusable React UI components, styling, and tree models for OpenChart apps.

## CSS import contract

Consumers must import the core styles explicitly:

```ts
import '@openchart/core/styles.css';
```

`@openchart/core/styles.css` includes `theme.css` and the shared global rules.
Consumers that need only tokens can import `@openchart/core/theme.css`.

## Included primitives

- Shared components are exported from `@openchart/core` and
  `@openchart/core/components`: Box, Button, Checkbox, Dropdown, ErrorBoundary,
  Icon, Input, ListView, Modal, Popup, Section, Separator, Slider, Splitter,
  Table, DataTable, Tabs, Text, and FileTreeView.
- File-tree, index-tree, object-tree, and subscriber model APIs are exported
  from the package entry point.
- `vars` and `gap` are shared CSS utility exports.

The component stories live alongside the package sources and can be browsed
with `npm run storybook:core` from the repository root. Run the package tests
with `npm run test:core-components`.

The package intentionally does not include editor-only MIDI behavior or Tauri runtime logic.
