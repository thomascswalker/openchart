import type { ReactNode } from "react";
import { AudioMixer, EventList, ViewportSettings } from "../../dialogs";
import {
  type TabOption,
  MixerIcon,
  TracksIcon,
  SettingsIcon,
} from "../../shared";

const DefaultTabIconSize = 24;

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

interface UseCommandPanelOptions {
  size?: number;
}

interface UseCommandPanelResult {
  options: TabOption[];
  children?: ReactNode[];
}

const useCommandPanel = (
  options: UseCommandPanelOptions = {},
): UseCommandPanelResult => {
  const tabOptions = getTabOptions(options.size || DefaultTabIconSize);

  return {
    options: tabOptions,
    children: [
      <AudioMixer key="mixer" />,
      <EventList key="event-list" />,
      <ViewportSettings key="settings" />,
    ],
  };
};

export { useCommandPanel };
