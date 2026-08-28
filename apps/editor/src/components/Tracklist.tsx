import { useEditor } from "./Context";
import "./styles.css";

export function TrackList() {
  const { midiData, selectedTrackIndex, setSelectedTrackIndex } = useEditor();

  if (!midiData) {
    return (
      <div className="track-list track-list--empty">No MIDI file loaded.</div>
    );
  }

  const handleTrackSelected = (index: number) => {
    const actualSelectedTrack = index
      ? index
      : midiData && midiData.tracks.length > 0
        ? 0
        : null;
    setSelectedTrackIndex(actualSelectedTrack);
  };

  return (
    <div className="track-list">
      {midiData.tracks.map((track, index) => {
        const selected = selectedTrackIndex === index;

        return (
          <div
            key={index}
            className={selected ? "track-row track-row--selected" : "track-row"}
            onClick={() => {
              handleTrackSelected(index);
            }}
          >
            <div className="track-row__header">
              <span className="track-row__number">{index + 1}</span>
              <span className="track-row__name">
                {track.name || `Track ${index + 1}`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
