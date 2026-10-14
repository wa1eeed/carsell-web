/**
 * ═══ أسماءُ أسرار كل تكامل — مُعلَنةٌ لا مُخمَّنة ═══
 *
 * المحرّر يقبل اسم مفتاحٍ حرًّا، **فحرفٌ زائد يحفظ سرًّا لا يقرؤه أحد**:
 * يُضبط التكامل في عين المشغّل ويبقى معطَّلًا في عين الكود، ولا شيء
 * يسقط — لأن القارئ يبحث عن اسمٍ آخر ويجد لا شيء، وهي حالُ «غير
 * مضبوط» نفسها.
 *
 * فالأسماء هنا، والمحرّر يُهيّئ صفوفَها، والمشغّل يملأ القيَم وحدها.
 *
 * ═══ ووحدةٌ بلا `db` عمدًا ═══
 *
 * يقرؤها محرّرُ الأدمن وهو مكوّن عميل، **والحدّ يمرّ عبر الاستيرادات لا
 * عبر التوجيهات**: وضعُها في `admin-integrations.ts` يجرّ Prisma إلى
 * حزمة المتصفّح ويُسقط البناء. وقع ثلاث مرّات، وأمسكته البوابة ١١ هنا
 * قبل الالتزام.
 *
 * **والقراءة من المصدر نفسه**: `resolveGateway` تقرأ `secretKey` و
 * `webhookSecret`، و`lookupCorporate` تقرأ `clientId` و`clientSecret`،
 * ومُهايئ بوّابة المزوّدين يقرأ `platformKey`.
 */
export const INTEGRATION_SECRET_FIELDS: Readonly<Record<string, readonly string[]>> = {
  payments: ['secretKey', 'webhookSecret'],
  /**
   * مفتاحُ المنصّة وحده — **والمصادقة Basic بكلمةِ مرورٍ فارغة**، فلا
   * حقلَ ثانٍ له. وأمّا معرّف المنصّة فيُقرأ من المزوّد لا يُكتب بيد:
   * معرّفٌ يُكتب خطأً يُرسل حصّتنا إلى حسابٍ آخر.
   */
  moyasar_platform: ['platformKey'],
  lean: ['clientId', 'clientSecret'],
  otp_sms: ['apiKey', 'senderId'],
  nafath: ['clientId', 'clientSecret'],
  vin_lookup: ['apiKey'],
  mojaz: ['apiKey'],
  r2: ['accountId', 'accessKeyId', 'secretAccessKey', 'bucket'],
  email: ['apiKey'],
};

/** حقولُ تكاملٍ بعينه — و`apiKey` لما لم يُعلَن، فالمحرّر لا يُفتح فارغًا. */
export function secretFieldsFor(key: string): readonly string[] {
  return INTEGRATION_SECRET_FIELDS[key] ?? ['apiKey'];
}
