import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { myVehicles } from '@/lib/domain/garage';

/**
 * ═══ حدُّ الشخصيّ والمنشأة ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٥: «صفحة الحساب للمستخدمين هم أفراد … والمعارض
 * لهم لوحتهم الخاصة».
 *
 * **ووُجد العطلُ بالنقر لا باختبار**: `Vehicle` تحمل `ownerId`
 * و`dealerId` معًا، فظهر مخزونُ المعرض في كراج صاحبه بالصفوف نفسِها
 * — وللبابين قاعدتان، إذ اللوحةُ تحصر البائع في فرعه والكراجُ لا يعرف
 * الفروع.
 */
describe('حد الشخصي والمنشأة', () => {
  it('ومخزون المعرض لا يظهر في كراج صاحبه', async () => {
    const owner = await db.user.findFirst({
      where: { dealerRole: 'OWNER', dealer: { vehicles: { some: {} } } },
      select: { id: true, dealerId: true },
    });
    /** **والشرط يُصنَع لا يُنتظَر**: طقمٌ بلا معرضٍ ذي مخزون لا يقيس شيئًا. */
    expect(owner, 'لا مالكَ معرضٍ له مخزون في البذرة').not.toBeNull();
    if (owner === null || owner.dealerId === null) return;

    const stock = await db.vehicle.findMany({
      where: { dealerId: owner.dealerId },
      select: { id: true, ownerId: true },
    });
    expect(stock.length, 'المعرضُ بلا مخزون').toBeGreaterThan(0);

    /** ومنها ما يملكه هو شخصيًّا — وهي بالضبط ما كان يتسرّب. */
    const his = stock.filter((vehicle) => vehicle.ownerId === owner.id);
    expect(his.length, 'لا مركبةَ معرضٍ يملكها صاحبُه — فالتسرّبُ غيرُ ممكن أصلًا').toBeGreaterThan(0);

    const garage = await myVehicles(owner.id, 'ar');
    const leaked = garage.filter((vehicle) => his.some((row) => row.id === vehicle.id));
    expect(leaked.map((vehicle) => vehicle.id)).toEqual([]);
  });

  it('وتعديلها من المتجر يُردّ بسببه الصحيح لا بـ«ليست لك»', async () => {
    const { editVehicle } = await import('@/lib/domain/garage');
    const vehicle = await db.vehicle.findFirst({
      where: { dealerId: { not: null } },
      select: { id: true, ownerId: true, mileageKm: true, colorExterior: true, city: true },
    });
    expect(vehicle, 'لا مركبةَ معرضٍ في البذرة').not.toBeNull();
    if (vehicle === null) return;

    const result = await editVehicle({
      userId: vehicle.ownerId,
      vehicleId: vehicle.id,
      mileageKm: 12_345,
      colorExterior: 'أحمر',
      city: 'الرياض',
    });

    /**
     * **و«ليست لك» سببٌ خاطئ**: هي له بحقّ، لكنّها مخزونُ منشأته —
     * وسببٌ يقول «ليست لك» يرسله يبحث عن عطلٍ في حسابه.
     */
    expect(result).toEqual({ ok: false, reason: 'BELONGS_TO_DEALER' });

    /** **ولا تُكتب**: الفحصُ في الاستعلام، فلا نافذةَ بينه وبين الكتابة. */
    const after = await db.vehicle.findUniqueOrThrow({
      where: { id: vehicle.id },
      select: { mileageKm: true, colorExterior: true, city: true },
    });
    expect(after).toEqual({
      mileageKm: vehicle.mileageKm,
      colorExterior: vehicle.colorExterior,
      city: vehicle.city,
    });
  });
});
