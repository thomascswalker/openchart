import TrackMixer from "./dialogs/TrackMixer";
import Box from "./shared/Box";
import { DirectoryIcon, MixerIcon, SettingsIcon } from "./shared/Icon/Icon";
import Tabs from "./shared/Tabs";
import { TrackList } from "./Tracklist";
import { ViewportSettings } from "./ViewportSettings";
import styles from "./CommandPanel.module.css";
import type { ReactNode } from "react";

interface TabDef {
  icon: ReactNode;
  component: () => ReactNode;
}

function getTabDefs(size: number): Record<string, TabDef> {
  return {
    track: { icon: <DirectoryIcon size={size} />, component: TrackList },
    mixer: { icon: <MixerIcon size={size} />, component: TrackMixer },
    viewport: {
      icon: <SettingsIcon size={size} />,
      component: ViewportSettings,
    },
  };
}

const CommandPanel = () => {
  const defs = getTabDefs(24);
  return (
    <Box
      className={styles.commandPanel}
      padding={0}
      maxWidth="400px"
      minWidth={0}
    >
      <Tabs
        alignment="left"
        options={Object.values(defs).map((o) => o.icon)}
        width="100%"
        flex={1}
        minWidth={0}
        minHeight={0}
      >
        {Object.values(defs).map(({ component: Comp }) => (
          <Comp />
        ))}
      </Tabs>
    </Box>
  );
};

export default CommandPanel;
