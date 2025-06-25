// vite.config.ts
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // 1) load all variables from .env* into an object
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      // 2) replace any occurrence of process.env.API_KEY → "your-key-here"
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    },
    resolve: {
      // 3) polyfill `process` so that if your code ever does `import process from 'process'`, it
      //    will pull in the browser shim rather than blow up at runtime.
      alias: {
        process: 'process/browser'
      },
      dedupe: ['react', 'react-dom']
    },
    server: {
      proxy: {
        '/api': 'http://localhost:5000'
      }
    }
  };
});
