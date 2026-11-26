import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { vehicleFields, type PublishInput } from './publish';
import type { VehicleCostKind } from '@/generated/prisma/enums';

/**
 * ═══ `D2b` — المعرضُ يُدخل مركبةً إلى مخزونه ═══
 *
 * قِيس ٢٠٢٦-١١-٢٦: **لا بابَ في اللوحة يضيف مركبة**. نصُّ الجدول
 * الفارغ يقول «أضف مركبة ليبدأ حساب الكلفة والهامش» ولا زرَّ تحته،
 * والإضافةُ الجماعية تحتاج ملفًّا، ومعالجُ البيع الشخصيّ `/sell` يُنشئ
 * إعلانًا لا مخزونًا — ولا يمرّ به عضوُ معرضٍ أصلًا بعد قرار المالك.
 *
 * ═══ والمخزونُ قبل العرض ═══
 *
 * (`ADR 0003`) مركبةٌ تُشترى ثمّ تُجهَّز ثمّ تُعرض — وربّما لا تُعرض.
 * فالإدخالُ هنا **لا يُنشئ إعلانًا**: يكتب المركبةَ وكلفةَ شرائها،
 * فيبدأ عدّادُ أيّام المكوث وحسابُ الهامش من يومها. والعرضُ على كارز
 * قرارٌ ثانٍ من خيارات المركبة.
 *
 * **وحقولُ المركبة من `vehicleFields`** — الدالّةُ التي يكتب بها
 * النشر: لقطةُ الكتالوج والموروثُ من الفئة وتطبيعُ اللوحة، كلُّها
 * قاعدةٌ واحدة. ونسخةٌ ثانيةٌ هنا تتباعد أوّلَ تغيير.
 */

export type AddVehicleInput = {
  vehicle: PublishInput['vehicle'];
  /** فرعُه — و`null` حين لا فروعَ للمعرض. */
  branchId: string | null;
  /** سعرُ الشراء — ومنه يبدأ الهامش، و`null` لمن يسجّله لاحقًا. */
  purchasePrice: number | null;
};

export type AddVehicleResult =
  | { ok: true; vehicleId: string }
  | { ok: false; reason: 'VALIDATION'; fields: Record<string, string> }
  | { ok: false; reason: 'VIN_TAKEN' }
  | { ok: false; reason: 'BRANCH_NOT_YOURS' }
  | { ok: false; reason: 'CATALOGUE_UNKNOWN' };

export function validateAddVehicle(input: AddVehicleInput): Record<string, string> {
  const fields: Record<string, string> = {};
  const v = input.vehicle;
  if (v.brandId === '' || v.modelId === '' || v.trimId === '') fields.model = 'REQUIRED';
  const year = Number(v.year);
  /** والسنةُ لا تُجمَّع ولا تُحدّ بسقفٍ ثابت: الطرازُ القادم يسبق التقويم. */
  if (!Number.isInteger(year) || year < 1970 || year > new Date().getFullYear() + 2) {
    fields.year = 'INVALID';
  }
  if (!Number.isInteger(Number(v.mileageKm)) || Number(v.mileageKm) < 0) {
    fields.mileageKm = 'INVALID';
  }
  if ((v.colorExterior ?? '').trim() === '') fields.colorExterior = 'REQUIRED';
  if ((v.city ?? '').trim() === '') fields.city = 'REQUIRED';
  /**
   * **وسعرُ الشراء صفرًا ليس «بلا سعر»**: من كتب صفرًا يقول إنها بلا
   * كلفة، ومن تركها فارغةً يقول «لاحقًا». فيُفرَّق الحالان.
   */
  if (input.purchasePrice !== null && !(input.purchasePrice >= 0)) {
    fields.purchasePrice = 'INVALID';
  }
  return fields;
}

export async function addDealerVehicle(
  actor: { userId: string; dealerId: string },
  input: AddVehicleInput,
  now: Date = new Date(),
): Promise<AddVehicleResult> {
  const fields = validateAddVehicle(input);
  if (Object.keys(fields).length > 0) return { ok: false, reason: 'VALIDATION', fields };

  /** **والفرعُ فرعُه** — ومعرّفٌ من معرضٍ آخر يُسند مخزونًا لجيرانه. */
  if (input.branchId !== null) {
    const branch = await db.branch.findFirst({
      where: { id: input.branchId, dealerId: actor.dealerId },
      select: { id: true },
    });
    if (branch === null) return { ok: false, reason: 'BRANCH_NOT_YOURS' };
  }

  const [brand, model, trim] = await Promise.all([
    db.brand.findUnique({ where: { id: input.vehicle.brandId }, select: { id: true, nameAr: true } }),
    db.model.findUnique({ where: { id: input.vehicle.modelId }, select: { id: true, nameAr: true } }),
    db.trim.findUnique({
      where: { id: input.vehicle.trimId },
      select: { id: true, nameAr: true, bodyType: true, drivetrain: true, seats: true },
    }),
  ]);
  if (brand === null || model === null || trim === null) {
    return { ok: false, reason: 'CATALOGUE_UNKNOWN' };
  }

  /**
   * **والهيكلُ فريدٌ في القاعدة**، فاصطدامُه يرمي «Unique constraint
   * failed» ويتّهم الإنشاء. ويُقرأ قبله فيُقال «هذا الهيكل مسجَّل».
   */
  const vin = (input.vehicle.vin ?? '').trim();
  if (vin !== '') {
    const taken = await db.vehicle.findUnique({ where: { vin }, select: { id: true } });
    if (taken !== null) return { ok: false, reason: 'VIN_TAKEN' };
  }

  const vehicle = await db.$transaction(async (tx) => {
    const created = await tx.vehicle.create({
      data: {
        ...vehicleFields({ sellerId: actor.userId, vehicle: input.vehicle }, { brand, model, trim }),
        /** **ومخزونُ المعرض بالمعرض لا بمالكه** — و`PERSONAL_VEHICLE` تقرأ هذا. */
        dealerId: actor.dealerId,
        ...(input.branchId === null ? {} : { branchId: input.branchId }),
        createdAt: now,
      },
      select: { id: true },
    });

    if (input.purchasePrice !== null) {
      await tx.vehicleCost.create({
        data: {
          vehicleId: created.id,
          kind: 'PURCHASE' satisfies VehicleCostKind,
          amount: new Prisma.Decimal(input.purchasePrice),
          incurredAt: now,
          recordedById: actor.userId,
          createdAt: now,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        actorType: 'user',
        entity: 'Vehicle',
        entityId: created.id,
        action: 'dealer.vehicle.add',
        before: {},
        after: {
          dealerId: actor.dealerId,
          branchId: input.branchId,
          hasPurchasePrice: input.purchasePrice !== null,
        },
        ip: null,
        createdAt: now,
      },
    });

    return created;
  });

  return { ok: true, vehicleId: vehicle.id };
}

/**
 * ═══ `D2d` — المخزونُ الراكد ═══
 *
 * «تحليل المخزون الراكد» يبيعه المنافسون باسمه، والسببُ بيّن: المعرضُ
 * يرى ما باع، **ولا يرى ما لم يُبَع** — ورأسُ المال الواقف لا ينادي.
 *
 * ═══ والعتبةُ من وسيط المعرض لا من رقمٍ نخترعه ═══
 *
 * «ستّون يومًا» رقمٌ يصلح لمعرضٍ ويكذب على آخر: من يبيع الفاخرَ يمكث
 * شهورًا ومن يبيع الاقتصاديَّ أسابيع. فالعتبةُ **وسيطُ مكوثِ ما باعه
 * هو** — ومن تجاوزها ركدَ بمقياس نفسِه.
 *
 * **وبلا تاريخٍ كافٍ تُقال العتبةُ وسببُها**: ثلاثُ بيعاتٍ لا تصنع
 * وسيطًا، فيُستعمل حدٌّ معلَن ويُقال إنه ليس وسيطَه بعد — ورقمٌ
 * يُعرض بلا مصدرٍ وعدٌ لا يُوفى.
 */
export const AGED_FALLBACK_DAYS = 60;
/** أقلُّ ما يصنع وسيطًا — وبيعتان لا تقولان شيئًا عن معرض. */
export const AGED_MIN_SAMPLE = 3;

export type StockAging = {
  thresholdDays: number;
  /** أمِن وسيطه هي أم من الحدّ المعلَن؟ — والشاشة تقول أيَّهما. */
  fromOwnMedian: boolean;
  /** عددُ البيعات التي بُني عليها الوسيط. */
  sample: number;
};

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  return sorted.length % 2 === 1
    ? (sorted[(sorted.length - 1) / 2] as number)
    : Math.round(((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2);
}

export async function stockAging(
  dealerId: string,
  branchId: string | null,
  now: Date = new Date(),
): Promise<StockAging> {
  /**
   * **والمكوثُ يُقاس بالساعة نفسِها التي يُقاس بها عمرُ الصفّ**: من
   * أوّل كلفةٍ مسجَّلة أو من إنشاء الصفّ إلى تاريخ الطلب. ومقياسان
   * مختلفان لشيءٍ واحد يجعلان العتبةَ لا تقارن شيئًا.
   */
  const sold = await db.order.findMany({
    where: {
      status: 'COMPLETED',
      listing: {
        vehicle: { dealerId, ...(branchId === null ? {} : { branchId }) },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      createdAt: true,
      listing: {
        select: {
          vehicle: { select: { createdAt: true, costs: { select: { incurredAt: true } } } },
        },
      },
    },
  });

  const ages = sold
    .map((order) => {
      const vehicle = order.listing.vehicle;
      const first = vehicle.costs
        .map((cost) => cost.incurredAt)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      const since = first ?? vehicle.createdAt;
      return Math.floor((order.createdAt.getTime() - since.getTime()) / 86_400_000);
    })
    .filter((days) => days >= 0);

  const own = ages.length >= AGED_MIN_SAMPLE ? median(ages) : null;
  void now;

  return own === null
    ? { thresholdDays: AGED_FALLBACK_DAYS, fromOwnMedian: false, sample: ages.length }
    : { thresholdDays: own, fromOwnMedian: true, sample: ages.length };
}
