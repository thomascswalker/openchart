import CommandPanel from "./CommandPanel";
import { Viewport } from "./Viewport";
import { DebugWindow } from "./dialogs/DebugDialog";

interface WorkspaceProps {
  debugVisible: boolean;
  onDebugClose: () => void;
}

export const Workspace = ({ debugVisible, onDebugClose }: WorkspaceProps) => {
  return (
    <div
      className={`midi-workspace${debugVisible ? " midi-workspace--debug" : ""}`}
    >
      <Viewport />
      {debugVisible ? <DebugWindow onClose={onDebugClose} /> : null}
    </div>
  );
};
