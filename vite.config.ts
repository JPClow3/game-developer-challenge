import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    watch: {
      ignored: [
        '**/playwright-report/**',
        '**/playwright-*-report/**',
        '**/test-results/**',
        '**/artifacts/**',
        '**/reports/**',
        '**/dist/**',
        '**/.git/**',
      ],
    },
  },
  preview: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor_pixi: ['pixi.js'],
          vendor_react: ['react', 'react-dom'],
          vendor_network: ['axios', '@tanstack/react-query'],
        },
      },
    },
  },
});
