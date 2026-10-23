import { useLayoutEffect, useSyncExternalStore } from "react";
import { runAction } from "../../../actions/execute";
import { useEditor } from "../../../hooks/useEditorState";
import { globalBindings } from "../../../input";
import { Hotkeys } from "../../../input/Hotkeys";
import { usePlatform } from "../../../platform";
import { EditorClipboardService } from "../../../services/editor/clipboard";
import { PlaybackService } from "../../../services/playback";
import { UpdaterService } from "../../../services/updater";
import { AboutDialog } from "../../dialogs/About/AboutDialog";
import { ProjectDialog } from "../../dialogs/Project/ProjectDialog";
import { SettingsDialog } from "../../dialogs/Settings/SettingsDialog";
import { UpdateDialog } from "../../dialogs/Update/UpdateDialog";
import { Section, Text } from "../../shared";
import { Menubar, type MenuCommandId } from "../Menubar";
import { Workspace } from "../Workspace";

const Shell = () => {
  const { error, projectVisible, settingsVisible, aboutVisible } = useEditor();
  const { services, actions } = usePlatform();
  const playbackService = services.get<PlaybackService>("playback");
  const isMetronomeEnabled = useSyncExternalStore(
    playbackService.subscribe,
    () => playbackService.getSnapshot().isMetronomeEnabled,
    () => playbackService.getSnapshot().isMetronomeEnabled,
  );
  const isClapEnabled = useSyncExternalStore(
    playbackService.subscribe,
    () => playbackService.getSnapshot().isClapEnabled,
    () => playbackService.getSnapshot().isClapEnabled,
  );
  const isVocalPitchFeedbackEnabled = useSyncExternalStore(
    playbackService.subscribe,
    () => playbackService.getSnapshot().isVocalPitchFeedbackEnabled,
    () => playbackService.getSnapshot().isVocalPitchFeedbackEnabled,
  );
  const updater = services.get<UpdaterService>("updater");
  const updaterStatus = useSyncExternalStore(
    updater.subscribe,
    () => updater.getSnapshot().status,
    () => updater.getSnapshot().status,
  );
  const clipboard = services.get<EditorClipboardService>("editor.clipboard");
  useLayoutEffect(() => {
    clipboard.sync();
  }, [clipboard]);

  const canRunMenuCommand = (command: MenuCommandId): boolean => {
    return actions.isAvailable(command);
  };

  const runMenuCommand = (command: MenuCommandId): void => {
    runAction(command);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <Hotkeys bindings={globalBindings} />
      <Menubar
        canExecute={canRunMenuCommand}
        isChecked={(command) =>
          command === "playback.toggle-metronome"
            ? isMetronomeEnabled
            : command === "playback.toggle-clap"
              ? isClapEnabled
              : command === "playback.toggle-vocal-pitch-feedback"
                ? isVocalPitchFeedbackEnabled
                : false
        }
        onCommand={runMenuCommand}
      />
      <Workspace />
      <Section
        minHeight={12}
        backgroundColor={error ? "var(--red-80)" : "transparent"}
        padding={2}
      >
        <Text fontSize={12}>{error || "..."}</Text>
      </Section>
      {projectVisible ? <ProjectDialog /> : null}
      {settingsVisible ? <SettingsDialog /> : null}
      {aboutVisible ? <AboutDialog /> : null}
      {updaterStatus !== "idle" ? <UpdateDialog /> : null}
    </div>
  );
};

export { Shell };
