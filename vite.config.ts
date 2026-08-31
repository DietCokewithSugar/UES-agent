import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': 'http://127.0.0.1:3001'
        }
      },
      plugins: [react()],
      define: {
        // Browser requests go through the Express proxy; never embed the real key in the bundle.
        'process.env.DEEPSEEK_API_KEY': JSON.stringify('server-managed'),
        'process.env.DEEPSEEK_API_BASE_URL': JSON.stringify('/api/deepseek'),
        'process.env.DEEPSEEK_VISION_MODEL': JSON.stringify(env.DEEPSEEK_VISION_MODEL || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
