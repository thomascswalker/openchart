import { useState } from "react";
import { useMidi } from "./Context";
import { TrackList } from "./Tracklist";
import { Viewport } from "./Viewport";

export const Workspace = () => {
  const { midiData } = useMidi();

  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number | null>(
    null,
  );

  const selectedTrackIsValid =
    midiData !== null &&
    selectedTrackIndex !== null &&
    selectedTrackIndex < midiData.tracks.length;

  const actualSelectedTrack = selectedTrackIsValid
    ? selectedTrackIndex
    : midiData && midiData.tracks.length > 0
      ? 0
      : null;

  return (
    <div className="midi-workspace">
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

        <TrackList
          selectedTrackIndex={actualSelectedTrack}
          onSelectTrack={setSelectedTrackIndex}
        />
      </section>
      <Viewport selectedTrackIndex={actualSelectedTrack} />
    </div>
  );
};
