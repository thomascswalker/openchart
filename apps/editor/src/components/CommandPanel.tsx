import TrackMixer from "./dialogs/TrackMixer";
import Box from "./shared/Box";
import { MixerIcon, SettingsIcon, TracksIcon } from "./shared/Icon/Icon";
import Tabs from "./shared/Tabs";
import { ViewportSettings } from "./ViewportSettings";
import styles from "./CommandPanel.module.css";
import type { TabOption } from "./shared/Tabs/Tab";
import EventList from "./editor/EventList/EventList";

function getTabOptions(size: number): TabOption[] {
  return [
    {
      title: "Audio Mixer",
      icon: <MixerIcon size={size} />,
    },
    {
      title: "Event List",
      icon: <TracksIcon size={size} />,
    },
    {
      title: "Viewport Settings",
      icon: <SettingsIcon size={size} />,
    },
  ];
}

const CommandPanel = () => {
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
          <TrackMixer key="mixer" />,
          <EventList key="event-list" />,
          <ViewportSettings key="settings" />,
        ]}
      </Tabs>
    </Box>
  );
};

export default CommandPanel;
