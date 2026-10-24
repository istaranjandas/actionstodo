import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Capture output and build artefacts are not part of the module graph; watching them only
    // produced EBUSY noise in the terminal
    watch: { ignored: ['**/.screenshots/**', '**/dist/**'] }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vite's own runtime helpers are shared glue, not React
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'vite-helpers';
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react-vendor';
          if (id.includes('@dimforge') || id.includes('@react-three/rapier')) return 'physics';
          if (id.includes('/three/') || id.includes('\\three\\')) return 'three';
          if (id.includes('@react-three')) return 'r3f';
          if (id.includes('firebase') || id.includes('@firebase')) return 'firebase';
          return undefined;
        }
      }
    }
  }
});
