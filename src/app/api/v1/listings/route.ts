import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { parseFilters, searchListings } from '@/lib/domain/listings';
import { createListing } from '@/lib/domain/publish';
import {
  FuelType,
  ListingType,
  Transmission,
  VehicleCondition,
  VehicleSpec,
} from '@/generated/prisma/enums';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/v1/listings` — القسم ٦.
 *
 * عام بلا مصادقة. الفلاتر تُفكّ بنفس الدالة التي تستعملها الشاشة،
 * فالرابط المشترَك يعطي النتيجة نفسها في الاثنين.
 *
 * `data` بطاقات مُسلسَلة — لا كائن Prisma: `Listing` يحمل
 * `minAcceptPrice` و`Auction` يحمل `reservePrice`، وإرجاع الكائن
 * خامًا يسرّب سرًّا تجاريًا بسطر واحد لا يلتقطه مراجع بثبات.
 */
export async function GET(request: NextRequest) {
  const filters = parseFilters(request.nextUrl.searchParams);
  const result = await searchListings(filters);

  return ok(result.items, {
    total: result.total,
    page: result.page,
    totalPages: result.totalPages,
    nextCursor: result.nextCursor,
    facets: result.facets,
    priceRange: result.priceRange,
  });
}

const PublishBody = z.object({
  type: z.enum(ListingType),
  askPrice: z.number().int().min(1).max(100_000_000),
  taxableSupply: z.boolean().nullable(),
  vehicle: z.object({
    brandId: z.string().min(1).max(40),
    modelId: z.string().min(1).max(40),
    trimId: z.string().min(1).max(40),
    year: z.number().int().min(1950).max(2100),
    mileageKm: z.number().int().min(0).max(2_000_000),
    /**
     * **التعدادات من المخطّط لا مكتوبةً بيد.**
     *
     * كتبتُها يدويًّا أوّلًا فاخترعتُ `WAGON` و`GULF` و`IMPORT` — ثلاثة
     * لا وجود لها. وقائمةٌ مكتوبة هنا مصدرُ حقيقةٍ ثانٍ ينحرف عن الأوّل
     * بصمت: تُضاف قيمة إلى المخطّط فيرفضها المسار، أو تُحذف فيقبلها.
     */
    transmission: z.enum(Transmission),
    fuel: z.enum(FuelType),
    spec: z.enum(VehicleSpec),
    condition: z.enum(VehicleCondition),
    city: z.string().min(1).max(60),
    colorExterior: z.string().min(1).max(40),
    vin: z.string().max(20).nullable(),
  }),
  // مفاتيح التخزين وحدها — والبصمة تُقرأ من الخادم لا من العميل
  images: z.array(z.string().min(1).max(300)).min(1).max(10),
});

/**
 * `POST /api/v1/listings` — نشر إعلان.
 *
 * **والحارس مع المسار لا بعده** (القرار ٣٣): ثلاثة شروط تُقيَّم عند
 * النشر وتُدخل المراجعة — ولا ترفض. ومسارٌ ينشر بلا تقييمها يفتح نافذةً
 * تكفي لنشرةٍ واحدة تفسد الفهرس.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = PublishBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ askPrice: 'INVALID' }), 422);

  const result = await createListing({ ...parsed.data, sellerId: user.id });

  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr:
          result.reason === 'VIN_ALREADY_LISTED'
            ? 'هذه المركبة معروضة بالفعل — اسحب الإعلان القائم أوّلًا.'
            : result.reason === 'NO_IMAGES'
              ? 'أضف صورة واحدة على الأقل.'
            : result.reason === 'IMAGE_NOT_UPLOADED'
              ? 'إحدى الصور لم تُرفع أو ليست لك — أعد رفعها.'
              : result.reason === 'PRICE_INVALID'
                ? 'أدخل سعرًا صحيحًا.'
                : result.reason === 'TRIM_UNKNOWN'
              ? 'اختر فئة المركبة.'
              : 'الماركة أو الطراز غير معروف.',
        messageEn:
          result.reason === 'VIN_ALREADY_LISTED'
            ? 'This vehicle is already listed — withdraw the existing listing first.'
            : result.reason === 'NO_IMAGES'
              ? 'Add at least one photo.'
            : result.reason === 'IMAGE_NOT_UPLOADED'
              ? 'One of the photos was not uploaded or is not yours — upload it again.'
              : result.reason === 'PRICE_INVALID'
                ? 'Enter a valid price.'
                : result.reason === 'TRIM_UNKNOWN'
              ? 'Choose the vehicle trim.'
              : 'Unknown brand or model.',
      },
      result.reason === 'VIN_ALREADY_LISTED' ? 409 : 422,
    );
  }

  /**
   * الحالة تعود صراحةً: **«نُشر» و«قيد المراجعة» ليسا سواءً**، والشاشة
   * التي تقول «نُشر» عن إعلانٍ في الطابور تَعِد بما لم يقع.
   */
  return ok(
    { ref: result.ref, status: result.status, reviewReason: result.reviewReason },
    undefined,
    { status: 201 },
  );
}
