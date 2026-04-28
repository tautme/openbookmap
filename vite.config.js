import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Multi-page app. Each HTML file at the repo root is a real entry point;
// Vite builds them all into a static `dist/` that drops straight onto
// GitHub Pages. No SPA router, no server.
export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        map: resolve(__dirname, 'map.html'),
        contribute: resolve(__dirname, 'contribute.html'),
        shop: resolve(__dirname, 'shop.html'),
        search: resolve(__dirname, 'search.html'),
        me: resolve(__dirname, 'me.html'),
        about: resolve(__dirname, 'about.html'),
        notFound: resolve(__dirname, '404.html'),
      },
    },
  },
  // onnxruntime-web ships its own wasm; let Vite leave it alone so the
  // dynamic .wasm fetch (configured by `ort.env.wasm.wasmPaths`) resolves.
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.js'],
  },
});
