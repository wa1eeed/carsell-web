import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentDealer } from '@/lib/auth/dealer-session';
import { addDealerVehicle } from '@/lib/domain/dealer-stock';
import {
  FuelType,
  Transmission,
  VehicleCondition,
  VehicleSpec,
} from '@/generated/prisma/enums';

export const runtime = 'nodejs';

/**
 * **والتعدادُ يُشتقّ لا يُكتب بجواره.** كتبتُها بيدًا أوّلًا فحملت
 * `IMPORT` و`OTHER` **ولا وجود لهما** (والمخطّطُ فيه `AGENT_IMPORT`
 * و`AMERICAN` و`KOREAN`) — وهو الصنفُ المسجَّل في `ALL_SPECS` نفسُه:
 * نسخةٌ تتباعد، ومن اختار قيمةً صحيحةً يردّها الخادم.
 */
const Body = z.object({
  brandId: z.string().min(1),
  modelId: z.string().min(1),
  trimId: z.string().min(1),
  year: z.number().int(),
  mileageKm: z.number().int().min(0),
  transmission: z.nativeEnum(Transmission),
  fuel: z.nativeEnum(FuelType),
  spec: z.nativeEnum(VehicleSpec),
  condition: z.nativeEnum(VehicleCondition),
  city: z.string().min(1).max(60),
  colorExterior: z.string().min(1).max(40),
  vin: z.string().max(24).nullable().optional(),
  plateLetters: z.string().max(12).nullable().optional(),
  plateNumbers: z.string().max(8).nullable().optional(),
  branchId: z.string().nullable().optional(),
  purchasePrice: z.number().min(0).nullable().optional(),
});

const MESSAGES: Record<string, { ar: string; en: string }> = {
  VIN_TAKEN: {
    ar: 'رقم الهيكل مسجل على مركبة أخرى — راجعه خانة بخانة.',
    en: 'That chassis number is already on another vehicle — check it digit by digit.',
  },
  BRANCH_NOT_YOURS: { ar: 'الفرع ليس من فروع معرضك.', en: 'That branch is not yours.' },
  CATALOGUE_UNKNOWN: {
    ar: 'الماركة أو الطراز أو الفئة غير معروفة.',
    en: 'Unknown brand, model or trim.',
  },
};

/**
 * `POST /api/v1/dealer/vehicles` — يُدخل مركبةً إلى مخزون المعرض.
 *
 * **ولا يُنشئ إعلانًا**: المخزونُ قبل العرض (`ADR 0003`). والعرضُ على
 * كارز قرارٌ ثانٍ من خيارات المركبة.
 *
 * **والمبيعاتُ تُدخل والمحاسبةُ تُدخل** — فلا يُحصر الإدخال بالمالك:
 * من يستقبل سيارةً في الصالة هو من يسجّلها، وحصرُه بالمالك يجعل
 * المخزونَ يُكتب في آخر اليوم بالذاكرة.
 */
export async function POST(request: NextRequest) {
  const actor = await currentDealer();
  if (actor === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const { branchId, purchasePrice, ...vehicle } = parsed.data;

  /**
   * **وبائعُ الفرع يُدخل في فرعه** — لا يختار فرعًا آخر. والمديرُ
   * والمالكُ لهما كلُّ الفروع، فيختاران.
   */
  const scoped = actor.branchId !== null ? actor.branchId : (branchId ?? null);

  const result = await addDealerVehicle(
    { userId: actor.userId, dealerId: actor.dealerId },
    {
      vehicle: {
        ...vehicle,
        vin: vehicle.vin ?? null,
        plateLetters: vehicle.plateLetters ?? null,
        plateNumbers: vehicle.plateNumbers ?? null,
      },
      branchId: scoped,
      purchasePrice: purchasePrice ?? null,
    },
  );

  if (!result.ok) {
    if (result.reason === 'VALIDATION') return fail(ERRORS.VALIDATION(result.fields), 422);
    const text = MESSAGES[result.reason];
    return fail(
      {
        code: result.reason,
        messageAr: text?.ar ?? 'تعذر إدخال المركبة.',
        messageEn: text?.en ?? 'Could not add the vehicle.',
      },
      result.reason === 'VIN_TAKEN' ? 409 : 422,
    );
  }

  return ok({ vehicleId: result.vehicleId });
}
