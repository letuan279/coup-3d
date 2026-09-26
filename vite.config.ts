import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r('./client'),
  publicDir: r('./client/public'),
  plugins: [react()],
  resolve: {
    alias: { '@shared': r('./shared') },
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  build: {
    outDir: r('./dist/client'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});
