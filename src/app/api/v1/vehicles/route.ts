import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { addVehicle } from '@/lib/domain/garage';
import {
  FuelType,
  Transmission,
  VehicleCondition,
  VehicleSpec,
} from '@/generated/prisma/enums';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ═══ `POST /api/v1/vehicles` — أضف سيارةً إلى سياراتك ═══
 *
 * **ولا تُعرض للبيع.** التصميم يرسم «مركباتي: ٢ معروضة · ١ في المرآب»،
 * ولم يكن للمرآب طريقٌ يُنتجه: كلّ ما يُنشئ مركبةً كان يكتب إعلانًا
 * معها — حتى المسودّة. فكان العدّاد صفرًا بنيويًّا، وزرُّ «أضف سيارة»
 * يقود إلى معالجٍ ينتهي بالنشر.
 *
 * ═══ وشروطُه شروطُ المِلك لا شروطُ العرض ═══
 *
 * لا هويةَ ولا آيبان ولا وضعَ ضريبيّ ولا صور. من يسجّل سيارةً ليطلب
 * عليها فحصًا لا يُسأل عمّا يُسأل عنه من يعرضها على الناس — وهي الحجّة
 * التي كُتبت للمسودّة، والمِلك أبعد عن العرض منها.
 *
 * **والتعدادات من المخطّط لا مكتوبةً بيد** — كما في مسار الإعلانات.
 */
/**
 * ═══ طولان لا يُخلطان — ويُفرَضان في الخادم ═══
 *
 * **البطاقةُ الجمركية عشرةُ أرقام، ورقمُ الهيكل سبعةَ عشرَ خانةً**
 * فيها حروفٌ وأرقام (قولُ المالك ٢٠٢٦-١٠-١٨). ووثيقةُ تأمين المركبة
 * الجديدة تُفعَّل على البطاقة وتُربط بنجم والمرور — فمن كتب رقم
 * الهيكل مكانها لا يعرف أنّه أخطأ حتى تُرفض وثيقتُه.
 *
 * **والشاشةُ تمنعه، والخادمُ يفرضه**: حارسٌ في العميل ليس حارسًا،
 * ونداءٌ مباشر يكتب ما يشاء.
 */
const VIN = z.string().regex(/^[0-9A-Z]{17}$/, 'VIN_FORMAT');
const CUSTOMS_CARD = z.string().regex(/^[0-9]{10}$/, 'CUSTOMS_FORMAT');

const Body = z.object({
  brandId: z.string().min(1).max(40),
  modelId: z.string().min(1).max(40),
  trimId: z.string().min(1).max(40),
  year: z.number().int().min(1950).max(2100),
  mileageKm: z.number().int().min(0).max(2_000_000),
  transmission: z.enum(Transmission),
  fuel: z.enum(FuelType),
  spec: z.enum(VehicleSpec),
  condition: z.enum(VehicleCondition),
  city: z.string().min(1).max(60),
  colorExterior: z.string().min(1).max(40),
  vin: VIN.nullable(),
  /**
   * لوحةُ المركبة — اختياريّة: مركبةٌ لم تُسجَّل بعدُ حالٌ قائمة.
   * والتطبيعُ في النطاق لا هنا، فيُقبل ما يُلصق كما يُلصق.
   */
  plateLetters: z.string().max(20).nullable().optional(),
  plateNumbers: z.string().max(12).nullable().optional(),
  /**
   * بطاقةٌ جمركية — للجديدة التي لم تُسجَّل بعد، فلا لوحةَ لها.
   * **ولا تظهر في أيّ استجابة عامّة** — مسلكُ اللوحة نفسُه.
   */
  customsCard: CUSTOMS_CARD.nullable().optional(),
});

export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    /** **والحقل المُعلَّم هو الذي سقط** — لا حقلٌ ثابت مهما كان الساقط. */
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues.slice(0, 6)) {
      fields[issue.path.join('.') || 'body'] = 'INVALID';
    }
    return fail(ERRORS.VALIDATION(fields), 422);
  }

  const result = await addVehicle({ sellerId: user.id, vehicle: parsed.data });
  if (!result.ok) {
    return fail(ERRORS.VALIDATION({ trimId: result.reason }), 422);
  }

  return ok({ vehicleId: result.vehicleId }, undefined, { status: 201 });
}
