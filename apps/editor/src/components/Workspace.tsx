import CommandPanel from "./CommandPanel";
import { Viewport } from "./Viewport";
import Splitter from "./shared/Splitter";

export const Workspace = () => {
  return (
    <div className={`midi-workspace`}>
      <Splitter>
        <CommandPanel />
        <Viewport />
      </Splitter>
    </div>
  );
};
