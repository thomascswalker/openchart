import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import packageJson from "../../package.json" with { type: "json" };
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDesktop =
    mode === "desktop" ||
    process.env.BUILD_TARGET === "desktop" ||
    Boolean(process.env.TAURI_ENV);

  const zodAlias = {
    find: /^zod$/,
    replacement: path.resolve(dir, "src/util/zod/index.ts"),
  };

  return {
    base: isDesktop ? "./" : "/openchart/",
    plugins: [react(), svgr()],
    resolve: {
      alias: [zodAlias],
    },
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    server: {
      watch: {
        usePolling: true,
        interval: 250,
      },
    },
    esbuild: mode === "production" ? { drop: ["console", "debugger"] } : {},
  };
});
