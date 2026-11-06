import { vi } from 'vitest';

import { mockLoggerService } from '../../__mock__/logger.mock';
import { createTestRulesetService } from '../../ruleset/__tests__/testUtils';
import { mockWorkspaceService } from '../../workspace/__tests__/utils';
import { type OpenedProject, ProjectService } from '../project';

export function makeProjectService(
  openedProject?: OpenedProject,
  rootHandle?: FileSystemDirectoryHandle,
): ProjectService {
  const workspace = mockWorkspaceService();
  if (rootHandle) {
    Object.assign(workspace, { getRootHandle: () => rootHandle });
  }
  const service = new ProjectService(
    mockLoggerService(),
    createTestRulesetService(),
    workspace,
  );
  service.init();

  if (openedProject) {
    Object.assign(service, {
      readProject: vi.fn(async () => openedProject),
    });
  }
  return service;
}
