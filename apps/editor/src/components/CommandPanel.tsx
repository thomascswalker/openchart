import TrackMixer from "./dialogs/TrackMixer";
import Box from "./shared/Box";
import { DirectoryIcon, MixerIcon, SettingsIcon } from "./shared/Icon/Icon";
import Tabs from "./shared/Tabs";
import { TrackList } from "./Tracklist";
import { ViewportSettings } from "./ViewportSettings";

const TABS = {
  track: { icon: <DirectoryIcon />, component: TrackList },
  mixer: { icon: <MixerIcon />, component: TrackMixer },
  viewport: { icon: <SettingsIcon />, component: ViewportSettings },
};

const CommandPanel = () => {
  return (
    <Box padding={0} maxWidth="400px">
      <Tabs alignment="left" options={Object.values(TABS).map((o) => o.icon)}>
        {Object.values(TABS).map(({ component: Comp }) => (
          <Comp />
        ))}
      </Tabs>
    </Box>
  );
};

export default CommandPanel;
