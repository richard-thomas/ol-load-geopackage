import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import path from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        // Multiple HTML files to process
        basic: resolve(__dirname, 'basic_example.html'),
        proj4: resolve(__dirname, 'proj4_example.html'),
        main: resolve(__dirname, 'index.html')
      },
    },
  },
  resolve: {
    alias: {
      // Ignore unnecessary Node.js modules referenced by sql.js
      // Equivalent to Webpack's { fs: false }
      fs: path.resolve(__dirname, 'src/noop.js'),
      crypto: path.resolve(__dirname, 'src/noop.js'),
      path: path.resolve(__dirname, 'src/noop.js'),
    },
  },
  // mpa allows vite server to return 404 instead of fallback to index.html
  appType: 'mpa',

  // Make project root relative to dist folder (allows simple deployment)
  base: './',
});
