import { AudioMixer, EventList, ViewportSettings } from "../../dialogs";
import { Box, MixerIcon, SettingsIcon, Tabs, TracksIcon } from "../../shared";
import type { TabOption } from "../../shared/Tabs";
import styles from "./CommandPanel.module.css";

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
          <AudioMixer key="mixer" />,
          <EventList key="event-list" />,
          <ViewportSettings key="settings" />,
        ]}
      </Tabs>
    </Box>
  );
};

export { CommandPanel };
