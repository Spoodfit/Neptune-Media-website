import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(here, 'src'),
  base: '/studio/local-engine/',
  build: {
    outDir: resolve(here, '../public/studio/local-engine'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    minify: 'esbuild',
    rollupOptions: {
      input: resolve(here, 'src/main.js'),
      output: {
        entryFileNames: 'neptune-video-local-engine-v1.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  worker: {
    format: 'es',
  },
});
