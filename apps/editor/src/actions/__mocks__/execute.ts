import { fn } from "storybook/test";
// The mock file is served from the original module's path, so a relative
// import would break; use the package subpath import instead.
import { MockPlaybackService } from "#usePlaybackMock";

export const runActionAsync = fn(
  async (id: string, ...args: unknown[]): Promise<void> => {
    MockPlaybackService.runAction(id, ...args);
  },
);

export const runAction = fn((id: string, ...args: unknown[]): void => {
  MockPlaybackService.runAction(id, ...args);
});
