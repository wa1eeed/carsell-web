import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { LISTING_FAILURE } from '@/lib/api/listing-failures';
import { currentDealer } from '@/lib/auth/dealer-session';
import { db } from '@/lib/db';
import { createListing } from '@/lib/domain/publish';
import { ListingType } from '@/generated/prisma/enums';

export const runtime = 'nodejs';

const Body = z.object({
  /** **والمزادُ ليس من هنا** — له إعداداتُه وشاشتُه (`D4`). */
  type: z.enum([ListingType.DIRECT, ListingType.NEGOTIATION]),
  askPrice: z.number().positive(),
  minAcceptPrice: z.number().positive().nullable().optional(),
  description: z.string().max(4000).optional(),
  showPlate: z.boolean().optional(),
  images: z.array(z.string().min(1)).min(1).max(12),
});

/**
 * `POST /api/v1/dealer/vehicles/{id}/publish` — يعرض مركبةً من المخزون.
 *
 * ═══ ولا منطقَ نشرٍ هنا ═══
 *
 * `createListing` هي مدخلُ النشر الوحيد في المنتج — فيها حُرّاسُ الملفّ
 * والوضع الضريبيّ وتوثيقِ سجلّ المعرض وخصائصِ الباقة وحدِّ المعروض
 * وكشفِ الصور المكرّرة وإرشادِ السعر. **وهذا المسار يترجم لا يقرّر**:
 * يتحقّق أنّ المركبة مركبةُ هذا المعرض، ثمّ يناديها.
 *
 * ومن نسخ شرطًا منها هنا أنتج حارسَين يتباعدان — وهو الصنفُ الذي كلّف
 * هذا المستودعَ مرارًا.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  /**
   * **ومركبةُ معرضٍ آخر لا تُعرض من هنا** — ولا يُفرَّق بين الغائبة
   * ومركبةِ غيرك: وجودُها ليس خبرًا يُعطى.
   *
   * **وفرعُ البائع يحدّه**: من حُصر بفرعٍ لا يعرض مخزونَ فرعٍ آخر، كما
   * لا يراه في جدوله.
   */
  const vehicle = await db.vehicle.findFirst({
    where: {
      id,
      dealerId: actor.dealerId,
      ...(actor.branchId === null ? {} : { branchId: actor.branchId }),
    },
    select: {
      id: true,
      brandId: true,
      modelId: true,
      trimId: true,
      year: true,
      mileageKm: true,
      transmission: true,
      fuel: true,
      spec: true,
      condition: true,
      city: true,
      colorExterior: true,
      vin: true,
      plateLetters: true,
      plateNumbers: true,
    },
  });
  if (vehicle === null) return fail(ERRORS.NOT_FOUND, 404);

  const result = await createListing({
    sellerId: actor.userId,
    vehicleId: vehicle.id,
    type: parsed.data.type,
    askPrice: parsed.data.askPrice,
    taxableSupply: null,
    /** والحدُّ الأدنى إعدادُ تفاوضٍ لا حقلٌ عامّ — ولا يخرج في استجابة. */
    ...(parsed.data.type === ListingType.NEGOTIATION && parsed.data.minAcceptPrice != null
      ? { negotiation: { minAcceptPrice: parsed.data.minAcceptPrice } }
      : {}),
    ...(parsed.data.description === undefined ? {} : { description: parsed.data.description }),
    ...(parsed.data.showPlate === undefined ? {} : { showPlate: parsed.data.showPlate }),
    images: parsed.data.images,
    /**
     * **وهويّةُ المركبة تُقرأ من صفّها** حين يُمرَّر `vehicleId` — وهذه
     * نسخةُ الصفّ نفسِه، فلا يُدخل المعرضُ بياناتٍ تخالف مخزونَه.
     */
    vehicle: {
      brandId: vehicle.brandId,
      modelId: vehicle.modelId,
      trimId: vehicle.trimId ?? '',
      year: vehicle.year,
      mileageKm: vehicle.mileageKm,
      transmission: vehicle.transmission,
      fuel: vehicle.fuel,
      spec: vehicle.spec,
      condition: vehicle.condition,
      city: vehicle.city,
      colorExterior: vehicle.colorExterior,
      vin: vehicle.vin,
      plateLetters: vehicle.plateLetters,
      plateNumbers: vehicle.plateNumbers,
    },
  });

  if (!result.ok) {
    const text = LISTING_FAILURE[result.reason];
    return fail(
      {
        code: result.reason,
        messageAr: text?.ar ?? 'تعذر عرض المركبة.',
        messageEn: text?.en ?? 'Could not publish the vehicle.',
      },
      text?.status ?? 422,
    );
  }

  return ok({ ref: result.ref, status: result.status, reviewReason: result.reviewReason });
}
