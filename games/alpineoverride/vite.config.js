import { defineConfig } from 'vite';

// Served by the main site at /alpineoverride; the build is written straight into its public folder
export default defineConfig({
  base: '/alpineoverride/',
  build: {
    outDir: '../../public/alpineoverride',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
});
