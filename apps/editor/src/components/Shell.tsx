import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { useEditorState } from "../hooks/useEditorState";
import { runAction } from "../actions/execute";
import { Workspace } from "./Workspace";
import { isTypingTarget } from "../util/html";
import { Menubar, type MenuCommandId } from "./Menubar";
import { SettingsDialog } from "./dialogs/SettingsDialog";
import { ProjectDialog } from "./dialogs/ProjectDialog";
import { AboutDialog } from "./dialogs/AboutDialog";
import { UpdateDialog } from "./dialogs/UpdateDialog";
import { usePlatform } from "../platform";
import { EditorClipboardService } from "../services/editor/clipboard";
import { PlaybackService } from "../services/playback";
import { UpdaterService } from "../services/updater";

const Shell = () => {
  const { error, debugVisible, projectVisible, settingsVisible, aboutVisible } =
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (event.defaultPrevented || isTypingTarget(target) || event.altKey)
        return;

      const key = event.key.toLowerCase();
      let action: string | null = null;
      if (!event.ctrlKey && !event.metaKey) {
        switch (key) {
          case "m":
            action = "playback.toggle-metronome";
            break;
          case "n":
            action = "playback.toggle-clap";
            break;
          case "p":
            action = "playback.toggle-vocal-pitch-feedback";
            break;
        }
      } else {
        switch (key) {
          case ",":
            action = "dialog.open-settings";
            break;
          case "o":
            action = "document.open";
            break;
          case "s":
            action = event.shiftKey ? "document.save-as" : "document.save";
            break;
          case "z":
            if (!event.shiftKey) action = "history.undo";
            break;
          case "y":
            action = "history.redo";
            break;
          case "c":
            action = "clipboard.copy";
            break;
          case "x":
            action = "clipboard.cut";
            break;
          case "v":
            action = "clipboard.paste";
            break;
        }
      }
      if (!action) {
        return;
      }
      clipboard.sync();
      if (!actions.isAvailable(action)) {
        return;
      }
      event.preventDefault();
      runAction(action);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions, clipboard]);

  return (
    <div className="midi-editor">
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
      {error ? (
        <div role="alert" aria-live="assertive">
          {error}
        </div>
      ) : null}
      <Workspace
        debugVisible={debugVisible}
        onDebugClose={() => runAction("dialog.close-debug")}
      />
      {projectVisible ? <ProjectDialog /> : null}
      {settingsVisible ? <SettingsDialog /> : null}
      {aboutVisible ? <AboutDialog /> : null}
      {updaterStatus !== "idle" ? <UpdateDialog /> : null}
    </div>
  );
};

export { Shell };
