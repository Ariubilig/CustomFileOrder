# Change Log

All notable changes to the "custom-file-order" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.3.0]

### Added

- **`Shift+Alt+Up` / `Shift+Alt+Down` reorder the selected items** while the view has focus.
  Plain arrow keys still navigate as before.
- **Reordering works on a multi-selection.** Selected items move as one block and keep their
  relative order; anything already against the top or bottom holds while the rest keep moving,
  the way moving lines works in the editor. Items are only reordered against siblings in the
  same folder.
- Tree items now carry a stable id, so selection and expansion survive a refresh and a moved
  item stays selected for the next keystroke.

### Changed

- Move feedback goes to the status bar rather than a notification, since the shortcut can
  repeat quickly.

## [1.2.0]

### Added

- **Explorer-style context menu.** New File and New Folder now appear on files as well as
  folders (creating siblings, as the built-in Explorer does), joined by Open to the Side,
  Open in Integrated Terminal and Copy Relative Path. Entries are grouped in the same order
  the Explorer uses.
- New File, New Folder and Refresh are now icons in the view's toolbar, with Open in
  Integrated Terminal and Paste in its `...` menu. These act on the workspace root, standing in
  for the empty-space menu that VS Code does not let extensions contribute
  ([microsoft/vscode#188259](https://github.com/microsoft/vscode/issues/188259)).
- Paste is hidden until something has been cut or copied.

## [1.1.0]

### Changed

- **Ordering rules are now keyed by workspace-relative path** (`.` for the root, `src/models`
  for a nested folder). Rules used to be stored under either an absolute path or a bare folder
  name, so two folders sharing a name shared one ordering, and a rule stopped applying as soon
  as the project moved. Existing rules are migrated automatically the first time the extension
  loads; rules pointing outside the workspace are dropped because they can never apply.
- A glob in an order list (`*.css`) now claims every entry it matches instead of just the first.
- Sorting is digit-aware, so `file2` comes before `file10`.
- Cut and paste moves files instead of copying them and then deleting the original.
- The "(custom order)" label now marks folders that carry their own rule, rather than every
  folder inside an ordered parent.

### Fixed

- Keybindings (F2, Delete, Ctrl+C/X/V) were declared outside `contributes` and were never
  registered by VS Code.
- Creating a file no longer silently switches its folder into custom-order mode.
- The tree no longer refreshes on every file save; create and delete events are debounced and
  the `enableAutoRefresh` setting is honoured.
- "Restore Item Position" is no longer offered in the command palette, where it did nothing.
- Duplicate is now available on folders, not just files.
- `npm test` runs again, via `@vscode/test-cli`.

### Removed

- Pattern rules (`"type": "pattern"`), which never produced an ordering.
- Leftover project-template code from a feature that was removed earlier.

## [Unreleased]

- Initial release
