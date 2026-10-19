import type { Prisma } from '@/generated/prisma/client';
import type { db } from '@/lib/db';
import { VEHICLE_HISTORY, serviceDetail } from '@/lib/labels/vehicle-history';

/**
 * ═══ تاريخُ المركبة — وكان بلا كاتبٍ إطلاقًا ═══
 *
 * `VehicleHistoryItem` صفرُ إشاراتٍ في `src/` كلِّه (قِيس ٢٠٢٦-١٠-١٩
 * بالبوابة ٦٣): صفوفٌ تزرعها البذرة عرضًا، وصفحةُ السيارة تقرؤها
 * وتعرضها — **ولا شيء يضيف إليها بعد فحصٍ ولا خدمةٍ ولا نقلِ ملكية**.
 * فسيارةٌ بِيعت على المنصّة وفُحصت فيها وخُدمت بها تبقى بلا سطرٍ
 * واحد، وهي الأشياءُ الثلاثة التي تعرفها المنصّة يقينًا.
 *
 * ═══ ولا يُكتب إلّا ما شهدناه ═══
 *
 * السطرُ هنا شهادةُ المنصّة لا وصفُ البائع. فما يقوله البائع عن
 * سيارته له موضعُه في الإعلان، ونقلُه إلى هذا السجلّ يُلبسه ثقةً لم
 * يكسبها — ومن يقرأ «نقل ملكية عبر المنصة» يقرأ واقعةً سجّلناها.
 */

type Client = Prisma.TransactionClient | typeof db;

type Entry = {
  vehicleId: string;
  type: 'owner' | 'service' | 'inspection';
  source: 'SELLER' | 'INSPECTION' | 'PLATFORM';
  titleAr: string;
  titleEn: string;
  detailAr?: string | null;
  detailEn?: string | null;
  occurredAt: Date;
};

/**
 * **ولا يُكتب السطرُ مرّتين.** مُناديه انتقالاتُ حالٍ محروسة، لكنّ
 * إعادةَ نشرِ تقريرٍ أو إعادةَ تشغيل وظيفةٍ تمرّ على ما مرّت عليه —
 * ومكرَّرٌ في تاريخ سيارة يُقرأ حدثين لا حدثًا.
 */
async function alreadyRecorded(client: Client, entry: Entry): Promise<boolean> {
  const found = await client.vehicleHistoryItem.findFirst({
    where: {
      vehicleId: entry.vehicleId,
      type: entry.type,
      titleAr: entry.titleAr,
      occurredAt: entry.occurredAt,
    },
    select: { id: true },
  });
  return found !== null;
}

export async function recordVehicleHistory(client: Client, entry: Entry): Promise<boolean> {
  if (await alreadyRecorded(client, entry)) return false;
  await client.vehicleHistoryItem.create({
    data: {
      vehicleId: entry.vehicleId,
      type: entry.type,
      source: entry.source,
      titleAr: entry.titleAr,
      titleEn: entry.titleEn,
      detailAr: entry.detailAr ?? null,
      detailEn: entry.detailEn ?? null,
      occurredAt: entry.occurredAt,
    },
  });
  return true;
}

/** ملكيّةٌ انتقلت باكتمال الطلب — والمنصّة هي من نقلها. */
export async function recordTransfer(
  client: Client,
  vehicleId: string,
  occurredAt: Date,
): Promise<boolean> {
  return recordVehicleHistory(client, {
    vehicleId,
    type: 'owner',
    source: 'PLATFORM',
    ...VEHICLE_HISTORY.transfer,
    occurredAt,
  });
}

/**
 * تقريرُ فحصٍ نُشر. **والمصدر `INSPECTION` لا `PLATFORM`**: الفاحصُ
 * طرفٌ ثالث، والتمييزُ هو ما يجعل السطر يساوي شيئًا عند المشتري.
 */
export async function recordInspection(
  client: Client,
  vehicleId: string,
  occurredAt: Date,
): Promise<boolean> {
  return recordVehicleHistory(client, {
    vehicleId,
    type: 'inspection',
    source: 'INSPECTION',
    titleAr: VEHICLE_HISTORY.inspection.titleAr,
    titleEn: VEHICLE_HISTORY.inspection.titleEn,
    occurredAt,
  });
}

/** خدمةٌ أُنجزت عبر مزوّد — واسمُها تفصيلُها. */
export async function recordService(
  client: Client,
  vehicleId: string,
  serviceName: string,
  occurredAt: Date,
): Promise<boolean> {
  const detail = serviceDetail(serviceName);
  return recordVehicleHistory(client, {
    vehicleId,
    type: 'service',
    source: 'PLATFORM',
    titleAr: VEHICLE_HISTORY.service.titleAr,
    titleEn: VEHICLE_HISTORY.service.titleEn,
    detailAr: detail.ar,
    detailEn: detail.en,
    occurredAt,
  });
}
