// vite.config.ts
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // 1) load all variables from .env* into an object
  // Avoid Node typings; assume root
  const env = loadEnv(mode, '.', '');

  return {
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    },
    resolve: {
      alias: { process: 'process/browser' },
      dedupe: ['react', 'react-dom']
    },
    // Service worker will be placed manually in public as sw.js for simplicity
  };
});
