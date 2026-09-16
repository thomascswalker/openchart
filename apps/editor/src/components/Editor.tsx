import { EditorProvider } from "../context/EditorContext";
import { PlaybackProvider } from "../context/PlaybackContext";
import { ApplicationSettingsProvider } from "../context/ApplicationSettingsContext";
import {
  EditorCommandProvider,
  useEditorCommands,
} from "../commands/EditorCommand";
import { Workspace } from "./Workspace";
import { Menubar } from "./Menubar";
import { SettingsDialog } from "./SettingsDialog";

import "./styles.css";

const Editor = () => {
  return (
    <EditorProvider>
      <PlaybackProvider>
        <ApplicationSettingsProvider>
          <EditorCommandProvider>
            <EditorShell />
          </EditorCommandProvider>
        </ApplicationSettingsProvider>
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
      {settingsVisible ? <SettingsDialog /> : null}
    </div>
  );
};

export default Editor;
