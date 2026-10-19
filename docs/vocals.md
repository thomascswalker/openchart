# Vocals

Vocals has no difficulties, so it is always edited in the **Piano Roll**.
Selecting Vocals from the track list or from the Highway's instrument buttons
switches the viewport to the Piano Roll, and the Highway button is disabled
while Vocals is selected.

## MIDI layout

All pitches are configured on the `VOCALS` entry in
[`packages/views/configs/default.json`](../packages/views/configs/default.json)
(C4 = 60).

| Kind         | Pitch         | Lyric required | Config key                      |
| ------------ | ------------- | -------------- | ------------------------------- |
| Pitched      | 36-84 (C2-C6) | Yes            | `vocals.range`                  |
| Pitchless    | 85 and 35     | Yes            | `pitchlessHigh`, `pitchlessLow` |
| Percussion   | 90            | No             | `percussion`                    |
| Vocal phrase | 96            | n/a            | `vocalPhrase`                   |
| Power window | 111           | n/a            | `powerWindow`                   |
| Stagepower   | 116           | n/a            | `power`                         |

`vocals.pitchlessPlacement` (`pitchlessHigh` or `pitchlessLow`) picks which
pitchless pitch new notes are written to. Both are read as pitchless.

Every pitched and pitchless note carries a **Lyric** meta event (type `0x05`)
on the same tick as the note. Text meta events are read and written as UTF-8,
so accented, CJK and emoji lyrics survive a save. Files written by older
single-byte tools fall back to Latin-1 when their bytes are not valid UTF-8.

## Data model

`VocalTrackView` (in `@openchart/views`, returned by
`SongView.getVocalTrackView()`) wraps the `VOCALS` MIDI track:

- `getNotes(kind?)` returns notes with their kind and paired lyric;
  `getPhrases(kind)` returns phrases.
- `addPitched`, `addPitchless` and `addPercussion` write a note and (when
  given) its lyric in one operation. `moveNotes`, `removeNotes` and
  `setLyric` keep each lyric on its note's tick.
- `addPhrase` and `updatePhrase` reject overlap with a phrase of the same kind.
- `validate()` reports missing lyrics, orphan lyrics, lyrics a few ticks off
  their note, unknown pitches and overlapping phrases. `repair()` snaps
  near-miss lyrics onto their note (and, with `removeOrphans`, deletes
  orphans).
- The MIDI track is created on the first edit, with a TrackName event so it
  maps back to Vocals when the file is reopened.

## Piano Roll

The Piano Roll is customised through a `PianoRollProfile`
([`profile.ts`](../apps/editor/src/components/views/pianoRoll/profile.ts)),
applied with `PianoRollView.setProfile()` so switching instruments does not
rebuild the renderer or reset the camera. The default profile reproduces the
original 0-127 behaviour.

The vocals profile:

- limits the pitch grid to C2-C6, dims rows outside it and labels each C on the
  keyboard;
- adds five **pinned lanes** under the header (Phrase, Power, Stage, Perc,
  Spoken) that do not scroll vertically, because those pitches sit outside the
  grid;
- shows only lyrics in the header's text lane, clips each lyric at the next
  one, and marks notes that have no lyric (amber note and header marker);
- fits C2-C6 to the viewport the first time, then remembers the vertical
  camera per profile and in the viewport session.

### Editing

| Action                         | Result                                                   |
| ------------------------------ | -------------------------------------------------------- |
| Drag in the grid               | Note of the toolbar's note type (Pitched by default)     |
| Drag in a pinned lane          | Phrase, percussion or pitchless note for that lane       |
| Drag with a phrase tool active | Phrase of that kind                                      |
| Drag a note                    | Moves it with its lyric; pitched notes stay within C2-C6 |
| Up/Down                        | Transposes pitched notes only                            |
| Delete, cut, copy, paste       | Lyrics are removed, copied and pasted with their notes   |

Creating a pitched or pitchless note opens the lyric input in the header:

- **Enter** commits. The note and lyric are one undo step.
- **Escape** (or leaving the input empty) removes the note again.
- **Tab** commits and moves to the next note's lyric, prompting for one if it
  has none. Tab also works when editing an existing lyric.

Lyrics are edited by hovering them in the header. In the vocals profile,
lyrics can't be deleted or dragged from the header; delete or move the note
instead.

## Pitch feedback

**Playback > Vocal Pitch Feedback** (`P`, or the speaker button on the vocals
toolbar) plays each pitched vocal note at its MIDI pitch during playback. Notes
are scheduled on the same look-ahead clock as the metronome. The voice is
monophonic and legato: a new note ends the previous one. Feedback follows the
selected vocal track, or the first vocal track while another instrument is
selected. With feedback on, placing or dragging a pitched note also auditions
it. Volume, attack and release use the preview settings.
