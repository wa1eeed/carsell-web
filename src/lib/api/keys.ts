/**
 * ═══ ما يحتاجه المتصفّح عن المفاتيح — بلا `db` ═══
 *
 * شاشةُ اللوحة تعرض الصفوف وتفحص المدى قبل الإرسال، و`domain/api-keys`
 * يستورد `db`. **وحدُّ الخادم/العميل يمرّ عبر الاستيرادات لا عبر
 * التوجيهات**: مكوّن `'use client'` يستورد وحدةً تستورد `db` يجرّ
 * Prisma إلى حزمة المتصفّح ويُسقط البناء — وقعت ثلاث مرّات قبل أن
 * تُعقد البوابة، ورابعةً هنا فكشفتها البوابة قبل أن تُلتزَم.
 */

export type ApiKeyView = {
  id: string;
  name: string;
  /** أوّلُ ثمانية أحرف — للتعرّف، ولا تكفي للاستعمال. */
  prefix: string;
  scopes: string[];
  rateLimit: number;
  active: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  createdBy: string;
  revokedAt: Date | null;
};

/** طلباتٌ في الدقيقة لكلّ مفتاح — يُفحص في النطاق أيضًا لا في الحقل وحده. */
export const RATE_LIMIT_RANGE = { min: 1, max: 6000 } as const;
