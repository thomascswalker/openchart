# `.midproject` format

A project is a standard ZIP archive with exactly two required canonical entries:

- `project.json` — validated project metadata using the checked-in `default.json` schema;
- `song.mid` — the standard MIDI bytes produced by `Midi.toBuffer()`.

`project.json.Version` is the **project data migration version**, initially `1`.
It is deliberately independent of the JSON Schema `$schema` URL. Future versions
must add a keyed migration in `projectService.ts`; unknown newer versions are
rejected to prevent data loss. The archive writer currently emits stored ZIP
entries deterministically, and its reader validates the ZIP structure and CRCs.

The runtime validator additionally requires a finite non-negative preview range,
`PreviewEnd >= PreviewStart`, a non-negative `Year`, and all difficulty values in
the inclusive `0..7` range. New documents start with empty text fields, `Year: 0`,
`AlbumTrack: 1`, zero difficulties, and a stable generated `ID`.
