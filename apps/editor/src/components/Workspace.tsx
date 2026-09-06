import { Viewport } from "./Viewport";
import { TrackList } from "./Tracklist";
import { DebugWindow } from "./DebugWindow";

interface WorkspaceProps {
  debugVisible: boolean;
  onDebugClose: () => void;
}

export const Workspace = ({ debugVisible, onDebugClose }: WorkspaceProps) => {
  return (
    <div
      className={`midi-workspace${debugVisible ? " midi-workspace--debug" : ""}`}
    >
      <TrackList />
      <Viewport />
      {debugVisible ? <DebugWindow onClose={onDebugClose} /> : null}
    </div>
  );
};
