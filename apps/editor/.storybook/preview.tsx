/// <reference types="vite/client" />

import type { Preview } from "@storybook/react-vite";
import { sb } from "storybook/test";
import "../src/globals.css";
import "../src/components/styles.css";
import "./preview.css";

// Action execution is replaced by src/actions/__mocks__/execute.ts, which
// routes playback actions to the mock playback service.
sb.mock("../src/actions/execute.ts");

const { MockPlaybackService } = await import("../src/hooks/usePlayback.mock");

const preview: Preview = {
  beforeEach: () => {
    MockPlaybackService.configure();
  },
  decorators: [
    (Story) => (
      <div className="storybook-stage">
        <Story />
      </div>
    ),
  ],
};

export default preview;
