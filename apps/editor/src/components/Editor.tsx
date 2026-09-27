import { useEffect, useState } from "react";
import { EditorProvider } from "../context/EditorContext";
import { PlaybackProvider } from "../context/PlaybackContext";
import { ApplicationSettingsProvider } from "../context/ApplicationSettingsContext";
import {
  EditorCommandProvider,
  useEditorCommands,
} from "../hooks/useEditorCommands";
import { Workspace } from "./Workspace";
import { Menubar, type MenuCommandId } from "./Menubar";
import { SettingsDialog } from "./SettingsDialog";
import { ProjectDialog } from "./ProjectDialog";
import { usePlayback } from "../context/PlaybackContextStore";
import type { ChartView } from "./views/ChartViews";

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
  const [chartView, setChartView] = useState<ChartView | null>(null);

  const canRunMenuCommand = (command: MenuCommandId): boolean => {
    if (command === "copy") return chartView?.canCopySelection() ?? false;
    if (command === "cut") return chartView?.canCutSelection() ?? false;
    if (command === "paste") return chartView?.canPasteClipboard() ?? false;
    return canExecute[command];
  };

  const runMenuCommand = (command: MenuCommandId): void => {
    if (command === "copy") chartView?.copySelection();
    else if (command === "cut") chartView?.cutSelection();
    else if (command === "paste") chartView?.pasteClipboard();
    else void dispatch(command);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        event.defaultPrevented ||
        (target instanceof HTMLElement &&
          (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
            target.isContentEditable)) ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey
      )
        return;

      const command =
        event.key.toLowerCase() === "c"
          ? "copy"
          : event.key.toLowerCase() === "x"
            ? "cut"
            : event.key.toLowerCase() === "v"
              ? "paste"
              : null;
      if (!command || !chartView) return;
      const enabled =
        command === "copy"
          ? chartView.canCopySelection()
          : command === "cut"
            ? chartView.canCutSelection()
            : chartView.canPasteClipboard();
      if (!enabled) return;
      event.preventDefault();
      if (command === "copy") chartView.copySelection();
      else if (command === "cut") chartView.cutSelection();
      else chartView.pasteClipboard();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chartView]);

  return (
    <div className="midi-editor">
      <Menubar
        canExecute={canRunMenuCommand}
        isChecked={(command) =>
          command === "toggleMetronome"
            ? isMetronomeEnabled
            : command === "toggleClap"
              ? isClapEnabled
              : false
        }
        onCommand={runMenuCommand}
      />
      <Workspace
        debugVisible={debugVisible}
        onDebugClose={() => void dispatch("closeDebugSettings")}
        onChartViewReady={setChartView}
      />
      {projectVisible ? <ProjectDialog /> : null}
      {settingsVisible ? <SettingsDialog /> : null}
    </div>
  );
};

export default Editor;
