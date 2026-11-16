import type { ReactNode } from 'react';

import Platform, { useSnapshot } from '../../../platform';
import type {
  WorkspaceService,
  WorkspaceSnapshot,
} from '../../../platform/services/workspace';
import { AudioMixer, EventList, ViewportSettings } from '../../dialogs';
import { FileTreeView } from '../../shared';
import {
  FilesIcon,
  MixerIcon,
  SettingsIcon,
  type TabOption,
  TracksIcon,
} from '../../shared';

const DefaultTabIconSize = 24;

function getTabOptions(size: number): TabOption[] {
  return [
    {
      title: 'Files',
      icon: <FilesIcon size={size} />,
    },
    {
      title: 'Audio Mixer',
      icon: <MixerIcon size={size} />,
    },
    {
      title: 'Event List',
      icon: <TracksIcon size={size} />,
    },
    {
      title: 'Viewport Settings',
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
  // Subscribing re-renders the panel when the workspace directory changes.
  useSnapshot<WorkspaceSnapshot>('workspace');
  const workspace = Platform.services.get<WorkspaceService>('workspace');

  return {
    options: tabOptions,
    children: [
      <FileTreeView key="files" rootHandle={workspace?.getRootHandle()} />,
      <AudioMixer key="mixer" />,
      <EventList key="event-list" />,
      <ViewportSettings key="settings" />,
    ],
  };
};

export { useCommandPanel };
