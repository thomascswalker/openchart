import TrackMixer from "./dialogs/TrackMixer";
import Box from "./shared/Box";
import { MixerIcon, SettingsIcon, TracksIcon } from "./shared/Icon/Icon";
import Tabs from "./shared/Tabs";
import { TrackList } from "./Tracklist";
import { ViewportSettings } from "./ViewportSettings";
import styles from "./CommandPanel.module.css";
import type { ViewportSession } from "../services/editor/viewports";
import type { TabOption } from "./shared/Tabs/Tab";

function getTabOptions(size: number): TabOption[] {
  return [
    {
      title: "Tracks",
      icon: <TracksIcon size={size} />,
    },
    {
      title: "Audio Mixer",
      icon: <MixerIcon size={size} />,
    },
    {
      title: "Viewport Settings",
      icon: <SettingsIcon size={size} />,
    },
  ];
}

const CommandPanel = ({ session }: { session: ViewportSession }) => {
  const options = getTabOptions(24);
  return (
    <Box
      className={styles.commandPanel}
      padding={0}
      maxWidth="100%"
      minWidth={0}
    >
      <Tabs
        alignment="left"
        flat
        collapsible
        options={options}
        width="100%"
        flex={1}
        minWidth={0}
        minHeight={0}
        maxWidth="100%"
      >
        {[
          <TrackList key="tracks" session={session} />,
          <TrackMixer key="mixer" />,
          <ViewportSettings key="settings" />,
        ]}
      </Tabs>
    </Box>
  );
};

export default CommandPanel;
