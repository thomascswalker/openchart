import { MidiProvider } from "./Context";
import { Workspace } from "./Workspace";
import { Toolbar } from "./Toolbar";

import "./styles.css";

const Editor = () => {
  return (
    <MidiProvider>
      <div className="midi-editor">
        <Toolbar />
        <Workspace />
      </div>
    </MidiProvider>
  );
};

export default Editor;
