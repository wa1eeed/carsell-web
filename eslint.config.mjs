import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import carsell from './eslint-rules/index.mjs';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    /**
     * `.next-check` مخرَج `build:check` — و`eslint .` كان يلتقطه حين
     * يوجد، فيُخرج ١٨ ألف مخالفة من شيفرةٍ مولَّدة تُغرق مخالفاتنا.
     * و`.dev-uploads` صور التطوير.
     */
    ignores: [
      '.next/**',
      '.next-check/**',
      '.dev-uploads/**',
      'node_modules/**',
      'next-env.d.ts',
      'design/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    plugins: { carsell },
    rules: {
      // خطأ ظهر مرتين يُغلَق آليًا (CLAUDE.md)
      'carsell/no-arabic-beside-number': 'error',
      // CLAUDE.md — ممنوع any في TypeScript
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
