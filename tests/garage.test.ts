import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { garageCounts, myVehicles, LIVE_LISTING_STATUSES } from '@/lib/domain/garage';

/**
 * ═══ المرآب — مركبةٌ يملكها صاحبُها ولم يعرضها ═══
 *
 * التصميم يرسمه منذ البداية («٢ معروضة · ١ في المرآب») ولوحة الأدمن
 * تعدّ شريحته، **ولم يكن يمكن أن يوجد**: الطريق الوحيد لإنشاء مركبة
 * هو النشر، وهو يكتب صفَّ إعلانٍ معها دائمًا — حتى المسودّة.
 */
describe('المرآب يُنتَج فعلًا', () => {
  it('البذرة فيها مركبةٌ بلا إعلان', async () => {
    const orphans = await db.vehicle.count({ where: { listings: { none: {} } } });
    expect(orphans).toBeGreaterThan(0);
  });

  /**
   * **والتعريف واحدٌ تقرؤه الشاشة واللوحة.** كانت اللوحة تعدّ صفوف
   * الإعلانات: مركبةٌ لها إعلانان تُعدّ مرّتين، ومسودّةٌ تُخرج صاحبها
   * من المرآب — فقالت الشاشة اثنين وقالت اللوحة واحدًا.
   */
  it('والمسودّة في المرآب لا في المعروض', () => {
    expect([...LIVE_LISTING_STATUSES]).toEqual(['PUBLISHED', 'PENDING_REVIEW', 'RESERVED']);
    expect([...LIVE_LISTING_STATUSES]).not.toContain('DRAFT');
    expect([...LIVE_LISTING_STATUSES]).not.toContain('SOLD');
  });

  it('وعدّادات المالك تُجمع فتساوي مركباته', async () => {
    const owner = await db.vehicle.findFirst({
      where: { listings: { none: {} } },
      select: { ownerId: true },
    });
    expect(owner).not.toBeNull();
    if (owner === null) return;

    const vehicles = await myVehicles(owner.ownerId, 'ar');
    const counts = garageCounts(vehicles);

    expect(counts.total).toBe(vehicles.length);
    /** **ولا مركبةَ خارج الثلاثة** — حالٌ رابعة تُضاف تسقط هنا. */
    expect(counts.listed + counts.garage + counts.sold).toBe(counts.total);
    expect(counts.garage).toBeGreaterThan(0);
  });

  /** ومركبةٌ بلا إعلانٍ تُقرأ `garage` لا شيئًا آخر. */
  it('وحالُ المركبة بلا إعلان هي garage', async () => {
    const row = await db.vehicle.findFirst({
      where: { listings: { none: {} } },
      select: { id: true, ownerId: true },
    });
    if (row === null) return;

    const mine = await myVehicles(row.ownerId, 'ar');
    const found = mine.find((vehicle) => vehicle.id === row.id);
    expect(found?.state).toBe('garage');
    expect(found?.listingRef).toBeNull();
  });
});

describe('تعديل المركبة وحذفها', () => {
  /**
   * **والملكية تُفحص في الاستعلام لا بعده** — فلا نافذةَ بين فحصٍ
   * وكتابة يسبقها طلبٌ ثانٍ.
   */
  it('لا يعدّل من لا يملك', async () => {
    const { editVehicle } = await import('@/lib/domain/garage');
    const mine = await db.vehicle.findFirst({ select: { id: true, ownerId: true } });
    if (mine === null) return;

    const other = await db.user.findFirst({
      where: { id: { not: mine.ownerId } },
      select: { id: true },
    });
    if (other === null) return;

    const result = await editVehicle({
      userId: other.id,
      vehicleId: mine.id,
      mileageKm: 1,
      colorExterior: 'أحمر',
      city: 'الرياض',
    });
    expect(result).toEqual({ ok: false, reason: 'NOT_YOURS' });
  });

  it('وممشًى خارج المدى يُردّ قبل الكتابة', async () => {
    const { editVehicle } = await import('@/lib/domain/garage');
    const row = await db.vehicle.findFirst({ select: { id: true, ownerId: true } });
    if (row === null) return;

    for (const mileageKm of [-1, 3_000_000, 1.5]) {
      const result = await editVehicle({
        userId: row.ownerId,
        vehicleId: row.id,
        mileageKm,
        colorExterior: 'أحمر',
        city: 'الرياض',
      });
      expect(result).toEqual({ ok: false, reason: 'BAD_MILEAGE' });
    }
  });

  /**
   * **والمخطّط يكتب قاعدة الحذف**: `Listing` و`InspectionReport` يشيران
   * بـ`Restrict`. ومركبةٌ عُرضت صارت جزءًا من تاريخ السوق، ومفحوصةٌ لها
   * تقريرٌ يقرؤه مشترٍ — فالمحذوف ما لم يُعرض ولم يُفحص.
   *
   * **والسبب يُفحص قبل المحاولة**: تركُ القاعدة ترمي يُخرج رسالةً عن
   * قيدٍ أجنبيّ لا يفهمها صاحب الحساب.
   */
  it('ومعروضةٌ لا تُحذف — ويُسمّى السبب', async () => {
    const { removeVehicle } = await import('@/lib/domain/garage');
    const listed = await db.vehicle.findFirst({
      where: { listings: { some: {} } },
      select: { id: true, ownerId: true },
    });
    if (listed === null) return;

    const result = await removeVehicle({ userId: listed.ownerId, vehicleId: listed.id });
    expect(result).toEqual({ ok: false, reason: 'HAS_LISTING' });
  });

  it('ومفحوصةٌ لا تُحذف', async () => {
    const { removeVehicle } = await import('@/lib/domain/garage');
    const inspected = await db.vehicle.findFirst({
      where: { listings: { none: {} }, inspectionReports: { some: {} } },
      select: { id: true, ownerId: true },
    });
    if (inspected === null) return;

    const result = await removeVehicle({ userId: inspected.ownerId, vehicleId: inspected.id });
    expect(result).toEqual({ ok: false, reason: 'HAS_INSPECTION' });
  });

  /** و`canRemove` تقول للشاشة قبل أن تعرض زرًّا — وزرٌّ يُرفض دائمًا أسوأ من غيابه. */
  it('و`canRemove` تطابق ما يقبله النطاق', async () => {
    const owner = await db.vehicle.findFirst({
      where: { listings: { some: {} } },
      select: { ownerId: true },
    });
    if (owner === null) return;

    const mine = await myVehicles(owner.ownerId, 'ar');
    for (const vehicle of mine) {
      if (vehicle.state !== 'garage') expect(vehicle.canRemove).toBe(false);
    }
  });
});
