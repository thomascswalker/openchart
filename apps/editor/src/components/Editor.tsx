import { EditorProvider } from "../context/EditorContext";
import { PlaybackProvider } from "../context/PlaybackContext";
import {
  EditorCommandProvider,
  useEditorCommands,
} from "../commands/EditorCommand";
import { Workspace } from "./Workspace";
import { Menubar } from "./Menubar";
import { AppSettingsDialog } from "./AppSettings";

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
      {settingsVisible ? <AppSettingsDialog /> : null}
    </div>
  );
};

export default Editor;
