import { EditorProvider } from "./EditorContext";
import { PlaybackProvider } from "./PlaybackContext";
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
