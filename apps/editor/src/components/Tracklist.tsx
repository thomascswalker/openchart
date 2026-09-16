import { useEditor } from "../context/EditorContext";
import { usePlayback } from "../context/PlaybackContextStore";
import { useEditorCommands } from "../commands/EditorCommand";
import "./styles.css";

export function TrackList() {
  const { midiData, selectedTrackIndex, setSelectedTrackIndex, setTrackCount } =
    useEditor();

  const { refresh } = usePlayback();
  const { markDirty } = useEditorCommands();

  if (!midiData) {
    return (
      <section className="arrangement">
        <div className="arrangement__header">
          <strong>Tracks</strong>
        </div>
        <div className="track-list track-list--empty">No MIDI file loaded.</div>
      </section>
    );
  }

  const handleAddTrack = (): void => {
    const newIndex = midiData.addTrack();
    setTrackCount(midiData.tracks.length);
    setSelectedTrackIndex(newIndex);
    markDirty();
  };

  const handleDeleteTrack = (index: number): void => {
    const newLength = midiData.removeTrack(index);
    setTrackCount(newLength);
    if (newLength === 0) {
      setSelectedTrackIndex(null);
    } else if (selectedTrackIndex !== null) {
      if (selectedTrackIndex === index) {
        setSelectedTrackIndex(Math.min(index, newLength - 1));
      } else if (selectedTrackIndex > index) {
        setSelectedTrackIndex(selectedTrackIndex - 1);
      }
    }
    refresh();
    markDirty();
  };

  const trackCount = midiData.tracks.length;

  return (
    <section className="arrangement">
      <div className="arrangement__header">
        <strong>Tracks</strong>
        <span className="arrangement__metadata">
          {trackCount} {trackCount === 1 ? "track" : "tracks"}
        </span>
      </div>

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
                <button
                  type="button"
                  className="track-row__delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteTrack(index);
                  }}
                  title={`Delete ${track.name || `Track ${index + 1}`}`}
                  aria-label={`Delete ${track.name || `Track ${index + 1}`}`}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
        <div
          className="track-row track-row--preview"
          onClick={handleAddTrack}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleAddTrack();
            }
          }}
          title="Add Track"
        >
          <div className="track-row__header">
            <span className="track-row__number track-row__number--preview">
              +
            </span>
            <span className="track-row__name track-row__name--preview">
              Add Track
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
