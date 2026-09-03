import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDesktop =
    mode === "desktop" ||
    process.env.BUILD_TARGET === "desktop" ||
    Boolean(process.env.TAURI_ENV);

  return {
    base: isDesktop ? "./" : "/midiview/",
    plugins: [react()],
    server: {
      watch: {
        usePolling: true,
        interval: 250,
      },
    },
  };
});
