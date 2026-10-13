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
