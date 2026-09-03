import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  base: "/midiview/",
  plugins: [react()],
  server: {
    watch: {
      usePolling: true,
      interval: 250,
    },
  },
});
