import { Viewport } from "./Viewport";
import { Arrangement } from "./Arrangement";

export const Workspace = () => {
  return (
    <div className="midi-workspace">
      <Arrangement />
      <Viewport />
    </div>
  );
};
