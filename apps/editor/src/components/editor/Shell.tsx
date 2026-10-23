import { useLayoutEffect, useSyncExternalStore } from "react";
import { useEditorState } from "../../hooks/useEditorState";
import { runAction } from "../../actions/execute";
import { Workspace } from "./Workspace";
import { Hotkeys } from "../../input/Hotkeys";
import { globalBindings } from "../../input";
import { Menubar, type MenuCommandId } from "./Menubar";
import { SettingsDialog } from "../dialogs/SettingsDialog";
import { ProjectDialog } from "../dialogs/ProjectDialog";
import { AboutDialog } from "../dialogs/AboutDialog";
import { UpdateDialog } from "../dialogs/UpdateDialog";
import { usePlatform } from "../../platform";
import { EditorClipboardService } from "../../services/editor/clipboard";
import { PlaybackService } from "../../services/playback";
import { UpdaterService } from "../../services/updater";
import { Section } from "../shared/Section";
import { Text } from "../shared/Text";
import styles from "./Shell.module.css";

const Shell = () => {
  const { error, projectVisible, settingsVisible, aboutVisible } =
    useEditorState();
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
    <div className={styles.midiEditor}>
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
