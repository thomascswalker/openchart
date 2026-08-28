import { useMidi } from "./Context";
import "./styles.css";

interface TrackListProps {
  selectedTrackIndex: number | null;

  onSelectTrack(index: number): void;
}

export function TrackList({
  selectedTrackIndex,
  onSelectTrack,
}: TrackListProps) {
  const { midiData } = useMidi();

  if (!midiData) {
    return (
      <div className="track-list track-list--empty">No MIDI file loaded.</div>
    );
  }

  return (
    <div className="track-list">
      {midiData.tracks.map((track, index) => {
        const selected = selectedTrackIndex === index;

        return (
          <div
            key={index}
            className={selected ? "track-row track-row--selected" : "track-row"}
            onClick={() => {
              onSelectTrack(index);
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
