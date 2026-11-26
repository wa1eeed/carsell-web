import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentDealer } from '@/lib/auth/dealer-session';
import { DEALER_MODULE, dealerHasModule } from '@/lib/domain/dealer-modules';
import { sellAtCounter } from '@/lib/domain/dealer-pos';

export const runtime = 'nodejs';

const Body = z.object({
  vehicleId: z.string().min(1),
  price: z.number().positive(),
  buyerName: z.string().min(1).max(120),
  buyerPhone: z.string().max(20).nullable().optional(),
  buyerVatNo: z.string().max(20).nullable().optional(),
  method: z.enum(['CASH', 'CARD', 'TRANSFER', 'INSTALLMENTS']),
  /** شروطُ العقد حين تكون البيعةُ تقسيطًا — وتُفحص قبل إصدار الفاتورة. */
  installments: z.object({
    downPayment: z.number().min(0),
    months: z.number().int().min(1).max(60),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).optional(),
  note: z.string().max(200).nullable().optional(),
});

const MESSAGES: Record<string, { ar: string; en: string; status: number }> = {
  VEHICLE_NOT_FOUND: {
    ar: 'المركبة ليست في مخزونك.',
    en: 'That vehicle is not in your stock.',
    status: 404,
  },
  ALREADY_SOLD: {
    ar: 'هذه المركبة مباعة بالفعل.',
    en: 'This vehicle is already sold.',
    status: 409,
  },
  /** **ومحجوزةٌ بطلبٍ قائم لا تُباع مرّتين** — ومالُ مشترٍ عندنا. */
  RESERVED_ON_MARKET: {
    ar: 'محجوزة بطلب قائم في السوق — أنه الطلب أو ألغه قبل البيع في الصالة.',
    en: 'Reserved by a live marketplace order — finish or cancel it before selling at the counter.',
    status: 409,
  },
};

/**
 * `POST /api/v1/dealer/pos` — بيعةُ صالة.
 *
 * **والبائعُ والمحاسبُ** — لا المحاسبُ وحده: من يقف عند العميل هو من
 * يُنهي البيعة، وحصرُها بالمالك يجعل الصالةَ تنتظر هاتفَه.
 */
export async function POST(request: NextRequest) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);
  /** **وحارسٌ في الشريط ليس حارسًا** — والموديولُ يُفحص هنا أيضًا. */
  if (!(await dealerHasModule(actor, DEALER_MODULE.pos))) return fail(ERRORS.FORBIDDEN, 403);
  if (actor.role === 'ACCOUNTANT') return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const result = await sellAtCounter(
    { userId: actor.userId, dealerId: actor.dealerId, branchId: actor.branchId },
    {
      vehicleId: parsed.data.vehicleId,
      price: parsed.data.price,
      buyerName: parsed.data.buyerName,
      buyerPhone: parsed.data.buyerPhone ?? null,
      buyerVatNo: parsed.data.buyerVatNo ?? null,
      method: parsed.data.method,
      ...(parsed.data.installments === undefined
        ? {}
        : {
            installments: {
              downPayment: parsed.data.installments.downPayment,
              months: parsed.data.installments.months,
              /** **وظهرُ اليوم بتوقيت الرياض** — فأجلٌ لا ينزلق إلى أمس. */
              startsOn: new Date(`${parsed.data.installments.startsOn}T12:00:00.000+03:00`),
            },
          }),
      note: parsed.data.note ?? null,
    },
  );

  if (!result.ok) {
    if (result.reason === 'VALIDATION') return fail(ERRORS.VALIDATION(result.fields), 422);
    if (result.reason === 'INVOICE_BLOCKED') {
      /**
       * **وسببُ الحجب يُقال** — «تعذّر الإصدار» تجعل المشغّلَ يعيد
       * المحاولة، و«لا قاعدة ضريبية مطابقة» تجعله يراجع الإعدادات.
       */
      return fail(
        {
          code: result.detail,
          messageAr: `تعذر إصدار الفاتورة — ${result.detail}. راجع إعدادات الضريبة.`,
          messageEn: `Could not issue the invoice — ${result.detail}.`,
        },
        422,
      );
    }
    const text = MESSAGES[result.reason];
    return fail(
      {
        code: result.reason,
        messageAr: text?.ar ?? 'تعذر إتمام البيعة.',
        messageEn: text?.en ?? 'Could not complete the sale.',
      },
      text?.status ?? 422,
    );
  }

  return ok(result);
}
