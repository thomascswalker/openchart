import { type IWorkspaceService, DefaultWorkspaceSnapshot } from "../workspace";

export const mockWorkspaceService = (): IWorkspaceService => {
  return {
    snapshot: { ...DefaultWorkspaceSnapshot },
    reset: () => {},
    isValid: () => true,
    discover: () => Promise.resolve(),
  } as unknown as IWorkspaceService;
};
