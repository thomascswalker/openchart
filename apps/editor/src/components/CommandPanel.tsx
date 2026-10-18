import TrackMixer from "./dialogs/TrackMixer";
import Box from "./shared/Box";
import { MixerIcon, SettingsIcon, TracksIcon } from "./shared/Icon/Icon";
import Tabs from "./shared/Tabs";
import { TrackList } from "./Tracklist";
import { ViewportSettings } from "./ViewportSettings";
import styles from "./CommandPanel.module.css";
import type { ViewportSession } from "../services/editor/viewports";
import type { TabOption } from "./shared/Tabs/Tab";

function getTabOptions(size: number, session: ViewportSession): TabOption[] {
  return [
    {
      title: "Tracks",
      icon: <TracksIcon size={size} />,
      component: () => <TrackList session={session} />,
    },
    {
      title: "Audio Mixer",
      icon: <MixerIcon size={size} />,
      component: TrackMixer,
    },
    {
      title: "Viewport Settings",
      icon: <SettingsIcon size={size} />,
      component: ViewportSettings,
    },
  ];
}

const CommandPanel = ({ session }: { session: ViewportSession }) => {
  const options = getTabOptions(24, session);
  return (
    <Box
      className={styles.commandPanel}
      padding={0}
      maxWidth="100%"
      minWidth={0}
    >
      <Tabs
        alignment="left"
        collapsible
        options={options}
        width="100%"
        flex={1}
        minWidth={0}
        minHeight={0}
        maxWidth="100%"
      >
        {Object.values(options).map(({ component: Comp }) => (
          <Comp />
        ))}
      </Tabs>
    </Box>
  );
};

export default CommandPanel;
