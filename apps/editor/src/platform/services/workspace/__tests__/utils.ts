import { WorkspaceService, type IWorkspaceService } from "..";

export const mockWorkspaceService = (): IWorkspaceService => {
  return {
    snapshot: WorkspaceService.defaultSnapshot(),
    reset: () => {},
    isValid: () => true,
    discover: () => Promise.resolve(),
  } as unknown as IWorkspaceService;
};

export const testWorkspaceService = (): WorkspaceService => {
  return new WorkspaceService();
};
