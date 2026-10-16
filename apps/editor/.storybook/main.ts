import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: [
    "../src/components/shared/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../src/components/views/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../src/components/dialogs/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};

export default config;
