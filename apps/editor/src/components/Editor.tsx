import { EditorProvider } from "../context/EditorContext";
import { PlaybackProvider } from "../context/PlaybackContext";
import { Workspace } from "./Workspace";
import { Toolbar } from "./Toolbar";

import "./styles.css";

const Editor = () => {
  return (
    <EditorProvider>
      <PlaybackProvider>
        <div className="midi-editor">
          <Toolbar />
          <Workspace />
        </div>
      </PlaybackProvider>
    </EditorProvider>
  );
};

export default Editor;
