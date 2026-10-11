import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { staticSecurityHeaders } from './src/lib/security/headers';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  /**
   * بناء التحقّق يكتب في مجلّد آخر.
   *
   * `next build` يكتب في `.next` نفسه الذي يخدم منه خادم التطوير،
   * فيفسد ذاكرته وتظهر أخطاء `Cannot find module './vendor-chunks/…'`
   * لا علاقة لها بالسبب. وقع مرّتين، فصار مجلّدًا منفصلًا:
   * `npm run build:check`.
   *
   * وهو **يعدّل `next-env.d.ts` و`tsconfig.json`** ليشيرا إلى المجلّد
   * الجديد — تعديلٌ لا يُلتزَم به: `git checkout` عليهما بعد البناء،
   * أو تشغيل `npm run dev` فيعيدهما. والبناء الحقيقي (`npm run build`)
   * لا يمسّهما لأنه يكتب في `.next` كما هو مكتوب فيهما.
   */
  ...(process.env.BUILD_DIR === undefined ? {} : { distDir: process.env.BUILD_DIR }),
  // القسم ١٢ — صورة Docker متعدّدة المراحل تعتمد على standalone
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // بوابة الجودة (القسم ١٤): لا يُبنى شيء وفيه خطأ نوع أو تحذير لينت
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },

  /**
   * ═══ رؤوس الأمان — على كل مسار ═══
   *
   * **والوسيط لا يكفي**: `matcher` فيه يستثني `/api` و`/admin`
   * و`/_next` — وهي أخطر ما في المنتج (الـAPI يحمل المال، واللوحة
   * تحمل الصلاحيات). فالثابت هنا ليشمل كل شيء، والمتغيّر (الـnonce)
   * في الوسيط.
   */
  async headers() {
    return [{ source: '/:path*', headers: staticSecurityHeaders() }];
  },
};

export default withNextIntl(nextConfig);
