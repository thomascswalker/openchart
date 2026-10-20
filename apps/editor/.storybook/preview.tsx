/// <reference types="vite/client" />

import type { Preview } from "@storybook/react-vite";
import "../src/globals.css";
import "../src/components/styles.css";
import "./preview.css";

const preview: Preview = {
  decorators: [
    (Story) => (
      <div className="storybook-stage">
        <Story />
      </div>
    ),
  ],
};

export default preview;
