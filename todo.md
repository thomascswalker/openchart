# TODO

## Multitrack audio

- Add toggle between single WAV track or multitrack audio.
- Add multitrack audio options for loading different WAV files for different instruments. Options are: lead, rhythm, bass, drums, vocals, harmonies, synth, other.

## General Bugs

- Do not show the main MIDI header chunk as a track.
- Instead of arbitrarily being able to add any number of tracks with different names, conform the track list to specifically read from the config track list (`packages/views/configs/default.json`).

## Docking/multiple viewports

- Allow side-by-side dockable viewports of any combination of piano roll or highway. Highways can be different instruments/difficulties. Allow up to 4 (customizable limit) viewports. Allow closing of a viewport with an X button, but if there's only one viewport it's maximized and cannot be closed.

## Piano Roll

- Text events
- Move events
- Bug where you need to keep the mouse on top of the event element in order to actually apply the edit. If you click a tempo event for instance, type in a new tempo value, and then move the mouse off _then_ press Enter, it won't actually apply.
- Move the track list into the piano roll view, to the left of the piano note visuals. Remove Track List header UI element.

## Highway

- Hide track list
- Remove Instrument/Difficulty select dropdown and replace with buttons along the Toolbar (mutually exclusive, similar to the Piano Roll/Highway switch buttons in the Toolbar).
- Starpower phrases
- Force Strum/HOPO/Tap phrases
- Improve sustain editing. Right-click and hold/drag to move. If the note is a chord, extend all notes of the chord. Right-click on a sustain to 'trim' it at that location.
- Multi note editing (marquee select, move, delete)
- Jump to next/previous section (text event `[section X]`)
- Keyboard editing (1-5 for note place/remove, up/down arrow keys to move forward/backward, right/left to change snap interval).
