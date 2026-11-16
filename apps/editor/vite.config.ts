import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

import packageJson from '../../package.json' with { type: 'json' };

const dir = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDesktop =
    mode === 'desktop' ||
    process.env.BUILD_TARGET === 'desktop' ||
    Boolean(process.env.TAURI_ENV);

  const zodAlias = {
    find: /^zod$/,
    replacement: path.resolve(dir, 'src/util/zod/index.ts'),
  };

  return {
    base: isDesktop ? './' : '/openchart/',
    plugins: [react(), svgr()],
    oxc: { decorator: { legacy: true } },
    resolve: {
      alias: [zodAlias],
      '@src': path.resolve(dir, 'src'),
      '@services': path.resolve(dir, 'src/platform/services'),
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
    esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : {},
  };
});
