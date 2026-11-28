import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { db } from '@/lib/db';
import { quoteFor, serviceTemplate } from '@/lib/domain/service-template';
import { serviceTotal } from '@/lib/domain/money';
import { DEFAULT_VAT_PCT } from '@/lib/domain/tax';

export const runtime = 'nodejs';

const Body = z.object({
  answers: z.record(z.string().max(40), z.string().max(2000)),
});

/**
 * `POST /api/v1/services/{key}/quote` — كم يصير السعر بهذه الإجابات؟
 *
 * ═══ ولمَ مسارٌ لا حسابٌ في الصفحة ═══
 *
 * قرارُ المالك أنّ حقول السعر **تحسب السعر قبل الدفع**، والحسابُ في
 * الخادم: رقمٌ يُحسب في المتصفّح يُرسَل من يد المستخدم. ونسخةٌ ثانية
 * للعرض وحده تتباعد عن الأصل أوّلَ تعديل — **فتقول الشاشةُ رقمًا
 * ويُحصّل الخادمُ آخر**.
 *
 * فالشاشةُ تسأل، والحسابُ واحدٌ هنا وعند الطلب.
 *
 * **وهو مفتوحٌ بلا جلسة**: لا يكشف إلّا سعرَ خدمةٍ معروضٍ أصلًا،
 * ولا يكتب شيئًا.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ answers: 'INVALID' }), 422);

  const template = await serviceTemplate(key);
  if (template === null) return fail(ERRORS.NOT_FOUND, 404);

  const quote = quoteFor(template, parsed.data.answers);
  if (!quote.ok) {
    /** **والناقصُ يُسمّى بحقله** — فالشاشة تضع الخطأ تحته. */
    return ok({ ready: false, fields: quote.fields });
  }

  /**
   * ═══ والمعاد هو ما يُدفع لا سعرُ الخدمة ═══
   *
   * **ورقمان لمالٍ واحد في شاشةٍ واحدة** (قاعدةٌ مسجَّلة): الزرُّ كان
   * يعرض الإجماليَّ شاملَ الرسم والضريبة قبل الإجابة، ثمّ يعرض سعرَ
   * الخدمة وحده بعدها — فيقرأ العميل ١٬٠٣٥ ثمّ ١٬٥٠٠ وكلاهما «ما
   * سيدفعه». فالقاعدةُ هنا هي قاعدةُ الصفحة نفسُها: `serviceTotal`.
   */
  const [service, platform] = await Promise.all([
    db.service.findUnique({
      where: { key },
      select: { adminFee: true, adminFeeEnabled: true, adminFeeMode: true },
    }),
    db.platformSetting.findUnique({ where: { id: 'default' }, select: { vatPct: true } }),
  ]);
  if (service === null) return fail(ERRORS.NOT_FOUND, 404);

  const money = serviceTotal(quote.total, Number(platform?.vatPct ?? DEFAULT_VAT_PCT), {
    mode: service.adminFeeMode,
    amount: service.adminFee,
    enabled: service.adminFeeEnabled,
  });

  return ok({
    ready: true,
    base: quote.base,
    extra: quote.extra,
    /** سعرُ الخدمة بعد زيادات القالب — قبل الرسم والضريبة. */
    servicePrice: quote.total,
    /** **وما يُدفع فعلًا** — وهو ما يُعرض على الزرّ. */
    total: money.total.toFixed(2),
    lines: quote.lines,
  });
}
