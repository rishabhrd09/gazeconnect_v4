import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@screens': path.resolve(__dirname, './src/screens'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // A fresh dev server transforms every module the first time the interface asks
    // for it, and the browser can only ask six at a time: measured 23 Sep 2026, the
    // first paint came 17.9 s after the window opened, while a reload of the same
    // 115 modules took 0.87 s. Warming the whole source tree at start-up uses the
    // seconds the launcher spends on TypeScript and Electron's own boot, so the
    // interface is served from cache instead of compiled while the patient waits.
    // Only what the first screen needs: warming all nineteen screens as well
    // made the warm-up compete with the very requests it was meant to serve.
    // The others are fetched by App.tsx once the first screen is up.
    warmup: {
      clientFiles: [
        './index.html', './src/main.tsx', './src/App.tsx',
        './src/screens/HomeScreen.tsx', './src/screens/AlertModeScreen.tsx',
        './src/contexts/**/*.tsx', './src/hooks/**/*.tsx',
        './src/components/core/**/*.tsx', './src/components/*.tsx',
        './src/utils/**/*.ts', './src/config/**/*.ts', './src/services/**/*.ts',
      ],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
    rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'] } } },
  },
  base: './',
});
