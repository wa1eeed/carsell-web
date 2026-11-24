import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { PRICING_MODELS, createSlot } from '@/lib/domain/ads';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/ads/slots` — مساحةٌ إعلانية جديدة.
 *
 * **«أضف مساحة» في ترميز A30 بلا باب**: الجدول يقلب راية المساحة
 * ولا شيء يُنشئ واحدة، فالسبعُ المزروعة هي كلُّ ما يملكه المشغّل.
 */
const Body = z.object({
  key: z.string().min(3).max(40),
  nameAr: z.string().min(1).max(60),
  sizeLabel: z.string().max(40).default(''),
  placement: z.string().max(60).default(''),
  pricingModel: z.enum(PRICING_MODELS),
  basePrice: z.string().min(1).max(12),
  maxPerSession: z.number().int().min(1).max(20),
});

const MESSAGES: Record<string, string> = {
  BAD_KEY: 'المفتاح حروف لاتينية صغيرة وأرقام وشرطة سفلية، ويبدأ بحرف.',
  KEY_TAKEN: 'مفتاح مستعمل — لكل مساحة مفتاحها.',
  NO_NAME: 'الاسم العربي مطلوب.',
  BAD_PRICING: 'نموذج تسعير غير معروف.',
  BAD_PRICE: 'السعر رقم أكبر من صفر.',
  BAD_CAP: 'السقف في الجلسة عدد صحيح من واحد فأكثر.',
};

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return fail(ERRORS.VALIDATION({ [typeof field === 'string' ? field : 'body']: 'INVALID' }), 422);
  }

  const result = await createSlot(guard.admin, parsed.data);
  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr: MESSAGES[result.reason] ?? 'تعذر إنشاء المساحة.',
        messageEn: 'Could not create the slot.',
      },
      result.reason === 'KEY_TAKEN' ? 409 : 422,
    );
  }

  return ok({ key: result.key });
}
