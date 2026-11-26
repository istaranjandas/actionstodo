import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The prebuilt game lives in public/alpineoverride. Netlify and Firebase rewrite its routes to
// its own index.html; do the same locally so the Arcade link opens the game, not this app.
function alpineOverdriveRoutes(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    const path = req.url?.split('?')[0] ?? '';
    if (path === '/alpineoverride' || (path.startsWith('/alpineoverride/') && !path.startsWith('/alpineoverride/assets/'))) {
      req.url = '/alpineoverride/index.html';
    }
    next();
  };
  return {
    name: 'alpine-overdrive-routes',
    configureServer: (server) => { server.middlewares.use(rewrite); },
    configurePreviewServer: (server) => { server.middlewares.use(rewrite); }
  };
}

export default defineConfig({
  plugins: [alpineOverdriveRoutes(), react()],
  // Only this app's page is an entry; the game's source under games/ has its own build
  optimizeDeps: { entries: ['index.html'] },
  server: {
    port: 5173,
    // Capture output and build artefacts are not part of the module graph; watching them only
    // produced EBUSY noise in the terminal
    watch: { ignored: ['**/.screenshots/**', '**/dist/**', '**/games/**'] }
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
