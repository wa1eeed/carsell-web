/**
 * ═══ الإبلاغ عن الأخطاء — مدخلٌ واحد ═══
 *
 * **وكل خطأ يُبلَّغ من هنا** لا من `console.error` متناثرة: حين يصل
 * مفتاح المزوّد يتغيّر ملفٌ واحد، ولا يُنسى مسارٌ يكتب إلى المجهول.
 *
 * وبلا مفتاح **يسقط بصمت إلى سطرٍ منظَّم على stderr** — لا خطأ ولا
 * تحويل: التكامل المؤجَّل فشلُه هو الحال المتوقَّع، وتحويل المتوقَّع
 * إلى خطأ يُغرق السجلّ بما لا يُقرأ.
 */

/** ما لا يُكتب في سجلّ أبدًا — **بالاسم، فالنيّة تظهر في التسمية**. */
const SECRET_KEY =
  /(secret|token|password|passwd|apikey|api_key|authorization|cookie|iban|vat|otp|pin|hash)/i;

/** ما يُشبه سرًّا في قيمته وإن لم يقله اسمه. */
const SECRET_VALUE = [
  /\bcsk_[A-Za-z0-9_-]{10,}\b/g,
  /\bsk_(live|test)_[A-Za-z0-9]{10,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{10,}\b/gi,
  /\beyJ[A-Za-z0-9._-]{20,}\b/g,
  /\b\d{15}\b/g,
  /\+9665\d{8}\b/g,
];

const MASK = '[محجوب]';

/**
 * الحجب **بالاسم وبالقيمة معًا**.
 *
 * فالاسم وحده يفوته سرٌّ في حقلٍ اسمه `note`، والقيمة وحدها تفوتها
 * كلمة مرورٍ قصيرة لا نمط لها. والاثنان يُغلقان أكثر ممّا يُغلق أحدهما.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return MASK;

  if (typeof value === 'string') {
    let out = value;
    for (const pattern of SECRET_VALUE) out = out.replace(pattern, MASK);
    return out;
  }
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) ? MASK : redact(item, depth + 1);
  }
  return out;
}

export type ErrorContext = {
  /** أين وقع — مسارٌ أو اسم مهمّة، لا رسالة للمستخدم */
  where: string;
  /** معرّف الطلب — به تُجمع أسطر الطلب الواحد */
  requestId?: string;
  /** معرّفات لا أسماء ولا هواتف */
  userId?: string;
  extra?: Record<string, unknown>;
};

/**
 * **لا يرمي أبدًا.** إبلاغٌ يرمي داخل معالج خطأ يُخفي الخطأ الأصلي
 * ويستبدله بخطأ الإبلاغ — وهو أسوأ ما يفعله سطرُ تشخيص.
 */
export function reportError(error: unknown, context: ErrorContext): void {
  try {
    const payload = {
      level: 'error',
      at: new Date().toISOString(),
      where: context.where,
      requestId: context.requestId ?? null,
      userId: context.userId ?? null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
      extra: context.extra === undefined ? null : redact(context.extra),
    };

    // سطرٌ منظَّم واحد — الأسطر المتعدّدة لا تُجمَّع في أي مُجمِّع سجلّات
    process.stderr.write(`${JSON.stringify(redact(payload))}\n`);
  } catch {
    // الإبلاغ لا يُسقط ما يُبلغ عنه
  }
}
