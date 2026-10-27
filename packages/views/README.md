# `@openchart/views`

`@openchart/views` provides non-owning, chart-oriented views over MIDI data.
`SongView` maps MIDI tracks to configured instrument tracks and exposes
difficulty-specific `ChartView` objects. Edits made through a chart update the
underlying `MidiTrack`.

## Hierarchy

```mermaid
flowchart TD
    subgraph View
        A[SongView] --> B[TrackView] --> C[ChartView]
    end

    subgraph MIDI
        MD[MIDI Document]
        MT[MIDI Track]
    end

    MD -.-> A
    MT -.-> B
    MD --> MT
```
