import { useEditor } from "../context/EditorContext";
import "./styles.css";

export function TrackList() {
  const { midiData, selectedTrackIndex, setSelectedTrackIndex, setTrackCount } =
    useEditor();

  if (!midiData) {
    return (
      <div className="track-list track-list--empty">No MIDI file loaded.</div>
    );
  }

  const handleAddTrack = (): void => {
    midiData.addTrack();
    setTrackCount(midiData.tracks.length);
  };

  const handleDeleteTrack = (): void => {
    if (selectedTrackIndex !== null) {
      console.log(`Deleting track ${selectedTrackIndex}`);
      const length = midiData.removeTrack(selectedTrackIndex);
      setTrackCount(length);
    }
  };

  return (
    <section className="arrangement">
      <div className="arrangement__header">
        <strong>Tracks</strong>

        {midiData && (
          <span className="arrangement__metadata">
            Format {midiData.header.format}
            {" · "}
            PPQN {midiData.header.division}
            {" · "}
            {midiData.tracks.length} tracks
          </span>
        )}
      </div>
      <section>
        <button onClick={handleAddTrack}>Add</button>
        <button onClick={handleDeleteTrack}>Delete</button>
      </section>
      <div className="track-list">
        {midiData.tracks.map((track, index) => {
          const selected = selectedTrackIndex === index;

          return (
            <div
              key={index}
              className={
                selected ? "track-row track-row--selected" : "track-row"
              }
              onClick={() => {
                setSelectedTrackIndex(index);
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
    </section>
  );
}
