import type { IWorkspaceService } from "../workspace";

export const mockWorkspaceService = (): IWorkspaceService => {
  return {
    rootHandle: undefined,
  } as IWorkspaceService;
};
