import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 لم يعد يقرأ `.env` تلقائيًا ولا يقبل `url` داخل المخطط.
 * محليًا نحمّل `.env`؛ وفي الإنتاج تأتي المتغيّرات من البيئة (Coolify)
 * فلا وجود للملف — لذا التحميل اختياري.
 */
try {
  process.loadEnvFile();
} catch {
  // لا ملف .env — المتغيّرات من البيئة نفسها
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    /**
     * `process.env` لا `env()` عمدًا: `env()` يرمي فورًا عند الغياب،
     * فيفشل `prisma generate` في مرحلة بناء Docker حيث لا قاعدة بيانات.
     * التوليد لا يحتاج اتصالًا؛ وأوامر الترحيل وحدها تحتاجه وتشتكي بنفسها.
     */
    url: process.env.DATABASE_URL,
    // قاعدة الظل يحتاجها `migrate dev` وحده — غير مطلوبة في الإنتاج
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
  migrations: {
    // tsx لأن العميل المولَّد في Prisma 7 بـTypeScript،
    // وnode 20 لا يجرّد الأنواع (الإنتاج على node 22 — القسم ١٢)
    seed: 'tsx prisma/seed.ts',
  },
});
