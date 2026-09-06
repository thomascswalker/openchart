import { useState } from "react";
import { EditorProvider } from "../context/EditorContext";
import { PlaybackProvider } from "../context/PlaybackContext";
import { Workspace } from "./Workspace";
import { Toolbar } from "./Toolbar";

import "./styles.css";

const Editor = () => {
  const [debugVisible, setDebugVisible] = useState(false);

  return (
    <EditorProvider>
      <PlaybackProvider>
        <div className="midi-editor">
          <Toolbar
            debugVisible={debugVisible}
            onDebugToggle={() => setDebugVisible((visible) => !visible)}
          />
          <Workspace
            debugVisible={debugVisible}
            onDebugClose={() => setDebugVisible(false)}
          />
        </div>
      </PlaybackProvider>
    </EditorProvider>
  );
};

export default Editor;
