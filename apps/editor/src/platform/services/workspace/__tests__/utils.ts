import { type IWorkspaceService, WorkspaceService } from '..';

export const mockWorkspaceService = (): IWorkspaceService => {
  return {
    snapshot: WorkspaceService.defaultSnapshot(),
    reset: () => {},
    subscribe: () => () => {},
    isValid: () => true,
    discover: () => Promise.resolve(),
  } as unknown as IWorkspaceService;
};

export const testWorkspaceService = (): WorkspaceService => {
  return new WorkspaceService();
};
