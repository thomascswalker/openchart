import { useEffect, useState, useSyncExternalStore } from "react";
import { useEditorState } from "../hooks/useEditorState";
import { executeEditorAction } from "../actions/execute";
import { Workspace } from "./Workspace";
import { Menubar, type MenuCommandId } from "./Menubar";
import { SettingsDialog } from "./dialogs/SettingsDialog";
import { ProjectDialog } from "./dialogs/ProjectDialog";
import type { ChartView } from "./views/ChartViews";
import { usePlatform } from "../platform";
import { EditorClipboardService } from "../services/editor/clipboard";
import { PlaybackService } from "../services/playback";

import "./styles.css";

const Shell = () => {
  const { debugVisible, projectVisible, settingsVisible } = useEditorState();
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
  const [chartView, setChartView] = useState<ChartView | null>(null);

  const clipboard = services.get<EditorClipboardService>("editor.clipboard");
  clipboard.setView(chartView);
  clipboard.sync();

  const canRunMenuCommand = (command: MenuCommandId): boolean => {
    clipboard.sync();
    return actions.isAvailable(command);
  };

  const runMenuCommand = (command: MenuCommandId): void => {
    void executeEditorAction(command).catch(() => {});
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        event.defaultPrevented ||
        (target instanceof HTMLElement &&
          (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
            target.isContentEditable)) ||
        event.altKey
      )
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
      void executeEditorAction(action).catch(() => {});
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
              : false
        }
        onCommand={runMenuCommand}
      />
      <Workspace
        debugVisible={debugVisible}
        onDebugClose={() =>
          void executeEditorAction("dialog.close-debug").catch(() => {})
        }
        onChartViewReady={setChartView}
      />
      {projectVisible ? <ProjectDialog /> : null}
      {settingsVisible ? <SettingsDialog /> : null}
    </div>
  );
};

export { Shell };
