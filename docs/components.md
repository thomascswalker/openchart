# Shared Components

Reusable UI components are owned by [`@openchart/core`](../packages/core).
Their stories are discovered by the core Storybook:

```bash
npm run storybook:core
```

Consumers must import `@openchart/core/styles.css` for the shared theme,
fonts, and global rules. Editor-specific `Form`, `FileInput`, and `getToolIcon`
remain in the editor because they depend on project services or editor
behavior.

## Components

- [Box](../packages/core/src/components/shared/Box/Box.tsx) — styled layout
  container.
- [Button and Checkbox](../packages/core/src/components/shared/Button/Button.tsx)
  — shared buttons and labeled checkbox.
- [Dropdown](../packages/core/src/components/shared/Dropdown/Dropdown.tsx) —
  select control and dropdown button.
- [ErrorBoundary](../packages/core/src/components/shared/ErrorBoundary/ErrorBoundary.tsx)
  — render-error boundary with diagnostics.
- [Icon](../packages/core/src/components/shared/Icon/Icon.tsx) — SVG wrapper
  and generated generic icons.
- [Input](../packages/core/src/components/shared/Input/Input.tsx) — styled
  text input.
- [ListView](../packages/core/src/components/shared/ListView/ListView.tsx) —
  keyboard-navigable listbox.
- [Modal](../packages/core/src/components/shared/Modal/Modal.tsx) — dialog
  backdrop and header.
- [Popup](../packages/core/src/components/shared/Popup/Popup.tsx) — anchored,
  dismissible non-modal panel.
- [Section](../packages/core/src/components/shared/Section/Section.tsx) —
  styled semantic section.
- [Separator](../packages/core/src/components/shared/Separator/Separator.tsx)
  — horizontal or vertical divider.
- [Slider](../packages/core/src/components/shared/Slider/Slider.tsx) — styled
  range input.
- [Splitter](../packages/core/src/components/shared/Splitter/Splitter.tsx) —
  resizable two-pane layout.
- [Table and DataTable](../packages/core/src/components/shared/Table/Table.tsx)
  — table primitives and virtualized data table.
- [Tabs](../packages/core/src/components/shared/Tabs/Tab.tsx) — selectable,
  optionally collapsible tabs.
- [Text](../packages/core/src/components/shared/Text/Text.tsx) — styled
  typography primitives.
- [FileTreeView](../packages/core/src/components/shared/Tree/Tree.tsx) —
  searchable file-tree view backed by core tree models.
