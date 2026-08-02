import { ERRORS, fail, ok } from '@/lib/api/response';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * `GET /api/v1/trims/{id}` — القيَم الموروثة لنموذج البيع (القسم ٦).
 *
 * **عام بلا مصادقة**: الكتالوج ليس سرًّا، ونموذج البيع يستدعيه قبل الدخول.
 *
 * المخرَج يمرّ بمُسلسِل: `Trim` يحمل `visible` و`modelId` وحقولًا داخلية،
 * وإرجاع كائن Prisma خامًا يسرّبها ويجعل كل حقل جديد جزءًا من العقد
 * العام بلا قرار.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const trim = await db.trim.findFirst({
    where: { id, visible: true, model: { visible: true, brand: { visible: true } } },
    include: {
      model: { include: { brand: true } },
      features: { include: { feature: true } },
    },
  });

  if (trim === null) return fail(ERRORS.NOT_FOUND, 404);

  return ok({
    id: trim.id,
    nameAr: trim.nameAr,
    nameEn: trim.nameEn,
    yearFrom: trim.yearFrom,
    yearTo: trim.yearTo,

    brand: {
      id: trim.model.brand.id,
      slug: trim.model.brand.slug,
      nameAr: trim.model.brand.nameAr,
      nameEn: trim.model.brand.nameEn,
    },
    model: {
      id: trim.model.id,
      nameAr: trim.model.nameAr,
      nameEn: trim.model.nameEn,
    },

    /** ما يُملأ آليًا في نموذج البيع — البائع لا يكتبها */
    inherited: {
      bodyType: trim.bodyType,
      transmission: trim.transmission,
      fuel: trim.fuel,
      drivetrain: trim.drivetrain,
      seats: trim.seats,
      doors: trim.doors,
      engineL: trim.engineL?.toString() ?? null,
      cylinders: trim.cylinders,
      horsepower: trim.horsepower,
    },

    /** المميّزات الافتراضية للفئة — الظاهرة منها وحدها */
    defaultFeatures: trim.features
      .filter((link) => link.isDefault && link.feature.active)
      .map((link) => ({
        key: link.feature.key,
        nameAr: link.feature.nameAr,
        nameEn: link.feature.nameEn,
        group: link.feature.group,
      })),
  });
}
