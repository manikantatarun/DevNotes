import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('@uiw/react-codemirror') || id.includes('@codemirror') || id.includes('react-markdown') || id.includes('remark-gfm')) {
            return 'editor-vendor';
          }

          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
            return 'vendor-react';
          }

          return 'vendor';
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
