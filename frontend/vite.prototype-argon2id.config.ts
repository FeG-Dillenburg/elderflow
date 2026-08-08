import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// PROTOTYPE ONLY: the isolation headers make Chromium's memory measurement API
// available while keeping this benchmark separate from the application dev server.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // 0.7.16's ESM wrapper imports a sibling file that is actually shipped by
      // the libsodium-sumo dependency. The CommonJS entry resolves it correctly.
      'libsodium-wrappers-sumo': require.resolve('libsodium-wrappers-sumo'),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      input: fileURLToPath(new URL('./prototypes/argon2id-unlock/index.html', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});
