import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/components/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  // Selects the "storybook" entries of package.json "imports" (e.g. #usePlayback).
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    resolve: {
      ...viteConfig.resolve,
      conditions: ["storybook", ...(viteConfig.resolve?.conditions ?? [])],
    },
  }),
};

export default config;
