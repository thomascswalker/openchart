import { useSyncExternalStore } from 'react';

import Platform from '../platform';
import { ProjectService } from '../platform/services/project/project';

export function useProject() {
  const project = Platform.services.get<ProjectService>('project');
  return useSyncExternalStore(
    project.subscribe,
    project.getSnapshot,
    project.getSnapshot,
  );
}
