/**
 * الاختبارات تمسّ قاعدة بيانات حقيقية — نفس حارس الزرع ينطبق:
 * لا تشغيل على الإنتاج بأي حال.
 */
try {
  process.loadEnvFile();
} catch {
  // المتغيّرات من البيئة نفسها
}

if ((process.env.APP_ENV ?? 'development') === 'production') {
  throw new Error('✗ الاختبارات تكتب في قاعدة البيانات — ممنوعة على APP_ENV=production');
}
