import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const here = import.meta.dirname;

// Tauri 开发端口固定为 1420，构建输出到 dist，供 src-tauri/tauri.conf.json 引用。
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: 'chrome110',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(here, 'index.html'),
        panel: resolve(here, 'panel.html'),
      },
    },
  },
});
