import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@core': path.join(root, 'core') },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['core/**/*.test.ts', 'ingest/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
