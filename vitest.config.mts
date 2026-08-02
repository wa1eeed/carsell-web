import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    // اختبارات القواعد تمسّ قاعدة البيانات، فتُشغَّل بالتسلسل
    fileParallelism: false,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
