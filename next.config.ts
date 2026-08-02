import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // القسم ١٢ — صورة Docker متعدّدة المراحل تعتمد على standalone
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // بوابة الجودة (القسم ١٤): لا يُبنى شيء وفيه خطأ نوع أو تحذير لينت
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
};

export default withNextIntl(nextConfig);
