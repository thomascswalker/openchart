import { EditorProvider } from "../context/EditorContext";
import { PlaybackProvider } from "../context/PlaybackContext";
import {
  EditorCommandProvider,
  useEditorCommands,
} from "../commands/EditorCommand";
import { Workspace } from "./Workspace";
import { Menubar } from "./Menubar";

import "./styles.css";

const Editor = () => {
  return (
    <EditorProvider>
      <PlaybackProvider>
        <EditorCommandProvider>
          <EditorShell />
        </EditorCommandProvider>
      </PlaybackProvider>
    </EditorProvider>
  );
};

const EditorShell = () => {
  const { debugVisible, settingsVisible, canExecute, dispatch } =
    useEditorCommands();

  return (
    <div className="midi-editor">
      <Menubar
        canExecute={(command) => canExecute[command]}
        onCommand={(command) => void dispatch(command)}
      />
      <Workspace
        debugVisible={debugVisible}
        onDebugClose={() => void dispatch("close-debug")}
      />
      {settingsVisible ? (
        <div className="settings-dialog-backdrop" role="presentation">
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <h2 id="settings-title">Settings</h2>
            <p>Editor settings will appear here as they become available.</p>
            <button
              type="button"
              onClick={() => void dispatch("close-settings")}
            >
              Close
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
};

export default Editor;
