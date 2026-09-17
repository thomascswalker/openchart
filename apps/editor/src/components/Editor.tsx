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
import { ProjectDialog } from "./ProjectDialog";
import { usePlayback } from "../context/PlaybackContextStore";

import "./styles.css";

const Editor = () => {
  return (
    <EditorProvider>
      <ApplicationSettingsProvider>
        <PlaybackProvider>
          <EditorCommandProvider>
            <EditorShell />
          </EditorCommandProvider>
        </PlaybackProvider>
      </ApplicationSettingsProvider>
    </EditorProvider>
  );
};

const EditorShell = () => {
  const {
    debugVisible,
    projectVisible,
    settingsVisible,
    canExecute,
    dispatch,
  } = useEditorCommands();
  const { isMetronomeEnabled, isClapEnabled } = usePlayback();

  return (
    <div className="midi-editor">
      <Menubar
        canExecute={(command) => canExecute[command]}
        isChecked={(command) =>
          command === "toggle-metronome"
            ? isMetronomeEnabled
            : command === "toggle-clap"
              ? isClapEnabled
              : false
        }
        onCommand={(command) => void dispatch(command)}
      />
      <Workspace
        debugVisible={debugVisible}
        onDebugClose={() => void dispatch("close-debug")}
      />
      {projectVisible ? <ProjectDialog /> : null}
      {settingsVisible ? <SettingsDialog /> : null}
    </div>
  );
};

export default Editor;
