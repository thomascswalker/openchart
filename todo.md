# TODO

## General

- Add metronome sound toggle.

## Application settings

- Application-wide settings include:
  - Setting the root audio discovery path: `Audio Path`
  - Setting the audio discovery regex for each instrument.
  - Default save mechanism (MIDI vs. Project).

## Project + settings

- Modify primary saving/loading mechanism to save/load a .midproject file which is essentially a .zip containing the MIDI file and a project config file (JSON).
- A project config file has the following schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Music Track Metaschema",
  "type": "object",
  "required": ["Version", "ID", "Song", "Chart", "Difficulty", "Credits"],
  "properties": {
    "Version": {
      "type": "integer"
    },
    "ID": {
      "type": "string"
    },
    "Song": {
      "type": "object",
      "required": [
        "Name",
        "Artist",
        "Album",
        "Genre",
        "Year",
        "AlbumTrack",
        "Cover",
        "CoverArtist",
        "VocalGender"
      ],
      "properties": {
        "Name": {
          "type": "string"
        },
        "Artist": {
          "type": "string"
        },
        "Album": {
          "type": "string"
        },
        "Genre": {
          "type": "string"
        },
        "Year": {
          "type": "integer"
        },
        "AlbumTrack": {
          "type": "integer",
          "minimum": 1
        },
        "Cover": {
          "type": "boolean"
        },
        "CoverArtist": {
          "type": "string"
        },
        "VocalGender": {
          "type": "string"
        }
      }
    },
    "Chart": {
      "type": "object",
      "required": ["Author", "PreviewStart", "PreviewEnd"],
      "properties": {
        "Author": {
          "type": "string"
        },
        "PreviewStart": {
          "type": "number",
          "minimum": 0
        },
        "PreviewEnd": {
          "type": "number",
          "minimum": 0
        }
      }
    },
    "Difficulty": {
      "type": "object",
      "required": [
        "Band",
        "LeadGuitar",
        "BassGuitar",
        "Drums",
        "ProDrums",
        "Vocals",
        "Harmony"
      ],
      "properties": {
        "Band": {
          "type": "integer"
        },
        "LeadGuitar": {
          "type": "integer"
        },
        "BassGuitar": {
          "type": "integer"
        },
        "Drums": {
          "type": "integer"
        },
        "ProDrums": {
          "type": "integer"
        },
        "Vocals": {
          "type": "integer"
        },
        "Harmony": {
          "type": "integer"
        }
      }
    },
    "Credits": {
      "type": "object",
      "required": ["Publisher", "Writer"],
      "properties": {
        "Publisher": {
          "type": "string"
        },
        "Writer": {
          "type": "string"
        }
      }
    }
  }
}
```

## Audio discovery

- Add root audio path to automatically load audio tracks.

## Multitrack audio

- Add toggle between single WAV track or multitrack audio.
- Add multitrack audio options for loading different WAV files for different instruments. Options are: lead, rhythm, bass, drums, vocals, harmonies, synth, other.

## General Bugs

- Changing from piano roll to highway and back doesn't automatically load the current notes (full midi track in piano roll and instrument/difficulty in highway). You need to switch tracks then back.
- Switching from highway to piano roll doesn't maintain the camera position in the piano roll respective to the current cursor location.

## Docking/multiple viewports

- Allow side-by-side dockable viewports of any combination of piano roll or highway. Highways can be different instruments/difficulties. Allow up to 4 (customizable limit) viewports. Allow closing of a viewport with an X button, but if there's only one viewport it's maximized and cannot be closed.
- Devise a plan for how the tracklist should be present (or not) if there's multiple highway views present. Perhaps have a number on the tracklist item indicating which viewport it's associated with?

## Highway

- Highway view only shows Lead Guitar track.
- Highway "flickers" when playing/scrolling/placing notes.
- You should not be able to edit notes while playing the track.
- Scroll direction in the highway is inverted.
- Default note placement should have no length (minimum MIDI note length).
- Move snap/interval, difficulty options to toolbar immediately below the View header bar.
- Separate monolithic highway/index.ts into separate files (similar to pianoRoll/index.ts).
- Add clap sound toggle for notes which cross the hit line (cursor).

## Piano roll

- Move snap/interval options to toolbar immediately below the View header bar.
- Add pitch output toggle of simple MIDI sound for either all notes in the track or a selected range of notes (e.g. C2 -> C4).
- Add "text event" marker row/editing.
