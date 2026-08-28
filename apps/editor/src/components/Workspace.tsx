import { Viewport } from "./Viewport";
import { TrackList } from "./Tracklist";

export const Workspace = () => {
  return (
    <div className="midi-workspace">
      <TrackList />
      <Viewport />
    </div>
  );
};
