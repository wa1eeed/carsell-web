import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { assignServiceRequest, bulkAssignServiceRequests } from '@/lib/domain/admin-services';

/**
 * ═══ إسنادُ طلب الخدمة من اللوحة (A6) ═══
 *
 * **ولم يكن في اللوحة إسنادٌ إطلاقًا**: الطابورُ بطاقاتٌ تُقرأ،
 * والمزوّدُ وحده يلتقط الطلب من طابوره — فطلبٌ لا يلتقطه أحد يبقى بلا
 * مزوّد حتى تنقضي مهلتُه، والمشغّلُ يراه ولا يملك شيئًا.
 *
 * **والجماعيُّ استدعاءٌ مفرد لكلّ طلب** لا `updateMany` على القائمة:
 * جملةٌ واحدة تُسنِد مئةً بخطأ سطر وتتخطّى الأهليّة.
 */

const made: string[] = [];
let adminId: string | null = null;
let providerId: string | null = null;

afterAll(async () => {
  if (made.length > 0) {
    await db.auditLog.deleteMany({ where: { entityId: { in: made } } });
    await db.serviceRequest.deleteMany({ where: { ref: { in: made } } });
  }
  if (providerId !== null) await db.serviceProvider.deleteMany({ where: { id: providerId } });
  if (adminId !== null) {
    await db.auditLog.deleteMany({ where: { actorId: adminId } });
    await db.adminUser.deleteMany({ where: { id: adminId } });
  }
  await db.$disconnect();
});

const TAG = `ASN${String(Date.now()).slice(-9)}`;

async function admin() {
  if (adminId !== null) return db.adminUser.findUniqueOrThrow({ where: { id: adminId } });
  const row = await db.adminUser.create({
    data: { email: `${TAG.toLowerCase()}@carsell.one`, name: 'مسنِد', role: 'SUPER_ADMIN', passwordHash: 'x' },
  });
  adminId = row.id;
  return row;
}

/** مزوّدٌ خاصٌّ بالقياس — فلا يُسنَد إليه شيءٌ من البذرة. */
async function probeProvider(cities: string[]) {
  if (providerId !== null) {
    await db.serviceProvider.update({ where: { id: providerId }, data: { cities } });
    return providerId;
  }
  const row = await db.serviceProvider.create({
    data: { nameAr: 'مزود قياس', nameEn: 'Probe', type: 'INSPECTION', cities, active: true },
  });
  providerId = row.id;
  return row.id;
}

async function request(city: string | null, serviceKey = 'inspection') {
  const service = await db.service.findFirstOrThrow({ where: { key: serviceKey }, select: { id: true } });
  const user = await db.user.findFirstOrThrow({ select: { id: true } });
  const ref = `${TAG}-${String(made.length)}`;
  await db.serviceRequest.create({
    data: { ref, serviceId: service.id, userId: user.id, status: 'NEW', amount: 450, city },
  });
  made.push(ref);
  return ref;
}

describe('إسنادُ طلب الخدمة', () => {
  it('يُسنِد ويكتب التدقيق', async () => {
    const operator = await admin();
    const ref = await request('الرياض');
    const result = await assignServiceRequest(operator, ref, await probeProvider(['الرياض']), null);

    expect(result.ok).toBe(true);
    const row = await db.serviceRequest.findUniqueOrThrow({ where: { ref }, select: { status: true, providerId: true } });
    expect(row.status).toBe('ASSIGNED');
    expect(row.providerId).toBe(providerId);
    expect(
      await db.auditLog.count({ where: { entityId: ref, action: 'service_request.assign' } }),
    ).toBe(1);
  });

  /**
   * **والأهليّةُ قاعدةُ طابور المزوّد نفسُها.** إسنادٌ إلى مزوّدٍ لا
   * يغطّي المدينة يُرسل الفاحص إلى مدينةٍ لا يعمل فيها، ولا يراه في
   * طابوره أصلًا.
   */
  it('ولا يُسنِد إلى من لا يغطّي المدينة', async () => {
    const operator = await admin();
    const ref = await request('أبها');
    const result = await assignServiceRequest(operator, ref, await probeProvider(['الرياض']), null);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('CITY_NOT_COVERED');
    const row = await db.serviceRequest.findUniqueOrThrow({ where: { ref }, select: { providerId: true } });
    expect(row.providerId, 'المرفوض لا يُكتب').toBeNull();
  });

  it('ولا إلى نوعٍ لا يؤدّيه', async () => {
    const operator = await admin();
    const ref = await request('الرياض', 'shipping');
    const result = await assignServiceRequest(operator, ref, await probeProvider(['الرياض']), null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('WRONG_TYPE');
  });

  /** **والمُسنَدُ لا يُسنَد ثانيةً** — ولا يُكتب فوق مزوّدٍ قائم. */
  it('ولا يُسنَد المُسنَدُ مرّتين', async () => {
    const operator = await admin();
    const ref = await request('الرياض');
    const provider = await probeProvider(['الرياض']);
    expect((await assignServiceRequest(operator, ref, provider, null)).ok).toBe(true);
    const again = await assignServiceRequest(operator, ref, provider, null);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('ALREADY_ASSIGNED');
  });

  /**
   * **وفشلُ واحدٍ لا يوقف الباقين**، والتقرير يقول أيُّها ولماذا —
   * لا «أُسنِد ٢ من ٤» بلا اسم.
   */
  it('والجماعيُّ يمضي على الباقي ويسمّي المتعذّر', async () => {
    const operator = await admin();
    const provider = await probeProvider(['الرياض']);
    const good = await request('الرياض');
    const farCity = await request('أبها');
    const wrongKind = await request('الرياض', 'shipping');

    const result = await bulkAssignServiceRequests(
      operator,
      [good, farCity, 'NO-SUCH-REF', wrongKind],
      provider,
      null,
    );

    expect(result.assigned).toEqual([good]);
    expect(result.failed.map((row) => row.reason).sort()).toEqual(
      ['CITY_NOT_COVERED', 'NOT_FOUND', 'WRONG_TYPE'].sort(),
    );
    /** والمرفوضُ لم يُكتب عليه شيء. */
    for (const ref of [farCity, wrongKind]) {
      const row = await db.serviceRequest.findUniqueOrThrow({ where: { ref }, select: { providerId: true } });
      expect(row.providerId).toBeNull();
    }
  });
});
