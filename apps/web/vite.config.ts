import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** The web app on :5173, with /api proxied to the server on :3000. */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Development only, so a Cloudflare quick tunnel can serve the dev server when sharing a
    // build for testing. Production is served as static files by nginx, which never reads this.
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
