import { useEditor } from "./Context";
import { TrackList } from "./Tracklist";

export const Arrangement = () => {
  const { midiData } = useEditor();

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
      <TrackList />
    </section>
  );
};
