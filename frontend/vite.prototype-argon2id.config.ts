import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const evidenceDirectory = fileURLToPath(new URL('./src/prototypes/argon2id-unlock/evidence', import.meta.url));
const evidenceEndpoint = '/__prototype/argon2id-unlock/evidence';
const maximumEvidenceBytes = 512 * 1024;

function safeDeviceLabel(value: unknown): string {
  if (typeof value !== 'string') return 'unlabelled-device';
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return slug || 'unlabelled-device';
}

function evidenceCollector(): Plugin {
  return {
    name: 'argon2id-prototype-evidence-collector',
    configureServer(server) {
      server.middlewares.use(evidenceEndpoint, async (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Allow', 'POST');
          response.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const chunks: Buffer[] = [];
          let receivedBytes = 0;
          for await (const chunk of request) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            receivedBytes += buffer.length;
            if (receivedBytes > maximumEvidenceBytes) {
              response.statusCode = 413;
              response.end(JSON.stringify({ error: 'Evidence payload is too large' }));
              return;
            }
            chunks.push(buffer);
          }

          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            capturedAt?: unknown;
            deviceLabel?: unknown;
            profile?: { id?: unknown };
          };
          if (
            typeof payload !== 'object'
            || payload === null
            || typeof payload.capturedAt !== 'string'
            || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(payload.capturedAt)
            || payload.profile?.id !== 'elderflow-shared-passphrase-v1'
          ) {
            response.statusCode = 400;
            response.end(JSON.stringify({ error: 'Invalid Argon2id benchmark evidence' }));
            return;
          }

          const timestamp = payload.capturedAt.replace(/[^0-9TZ-]/g, '-');
          const filename = `${timestamp}-${safeDeviceLabel(payload.deviceLabel)}-${randomUUID().slice(0, 8)}.json`;
          await mkdir(evidenceDirectory, { recursive: true });
          await writeFile(
            `${evidenceDirectory}/${filename}`,
            `${JSON.stringify(payload, null, 2)}\n`,
            { encoding: 'utf8', flag: 'wx' },
          );

          response.statusCode = 201;
          response.end(JSON.stringify({
            saved: true,
            file: `frontend/src/prototypes/argon2id-unlock/evidence/${filename}`,
          }));
        } catch (error) {
          response.statusCode = error instanceof SyntaxError ? 400 : 500;
          response.end(JSON.stringify({
            error: error instanceof SyntaxError
              ? 'Evidence payload is not valid JSON'
              : 'Could not save benchmark evidence',
          }));
        }
      });
    },
  };
}

// PROTOTYPE ONLY: the isolation headers make Chromium's memory measurement API
// available while keeping this benchmark separate from the application dev server.
export default defineConfig({
  plugins: [vue(), evidenceCollector()],
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
