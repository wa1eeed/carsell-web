import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  changeServicePrice,
  createService,
  editService,
  listServiceRequests,
  listServicesForAdmin,
  moveService,
} from '@/lib/domain/admin-services';

afterAll(async () => {
  await db.$disconnect();
});

const T0 = new Date('2026-06-01T10:00:00Z');
const hours = (n: number): Date => new Date(T0.getTime() + n * 3600 * 1000);

async function admin() {
  return db.adminUser.create({
    data: {
      email: `svc${String(Date.now()).slice(-9)}@carsell.one`,
      name: 'مشغّل', role: 'OPS', passwordHash: 'x',
    },
  });
}

describe('A7 — تغيير السعر لا يمسّ القائم', () => {
  /**
   * الحماية **بنيوية لا سلوكية**: `amount` عمود مستقلّ يُملأ وقت
   * الإنشاء، فلا يحتاج انضباطًا يتذكّره كاتب الاستعلام التالي.
   */
  it('طلب قائم يبقى بسعره بعد تغيير سعر الخدمة', async () => {
    const operator = await admin();
    const service = await db.service.findFirstOrThrow({ where: { key: 'inspection' } });
    const user = await db.user.findFirstOrThrow();
    const original = Number(service.price);

    const request = await db.serviceRequest.create({
      data: {
        ref: `SRV-T-${String(Date.now()).slice(-9)}`,
        serviceId: service.id,
        userId: user.id,
        status: 'NEW',
        amount: service.price,
        createdAt: T0,
      },
    });

    const changed = await changeServicePrice(operator, 'inspection', original + 200, null);
    expect(changed.ok).toBe(true);
    if (changed.ok) expect(changed.untouchedRequests).toBeGreaterThanOrEqual(1);

    const after = await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(Number(after.amount)).toBe(original);
    expect(Number((await db.service.findUniqueOrThrow({ where: { key: 'inspection' } })).price)).toBe(
      original + 200,
    );

    // إعادة الحال
    await changeServicePrice(operator, 'inspection', original, null);
    await db.serviceRequest.delete({ where: { id: request.id } });
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('التغيير يُكتب في سجلّ التدقيق بالقيمتين', async () => {
    const operator = await admin();
    const service = await db.service.findFirstOrThrow({ where: { key: 'mojaz' } });
    const original = Number(service.price);

    await changeServicePrice(operator, 'mojaz', original + 5, null);
    const entry = await db.auditLog.findFirstOrThrow({
      where: { actorId: operator.id, action: 'service.price_changed' },
    });
    expect((entry.before as { price?: string })?.price).toBe(String(original));
    expect((entry.after as { price?: string })?.price).toBe(String(original + 5));

    await changeServicePrice(operator, 'mojaz', original, null);
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('السعر نفسه لا يُكتب قيدًا — والسجلّ لا يمتلئ بلا شيء', async () => {
    const operator = await admin();
    const service = await db.service.findFirstOrThrow({ where: { key: 'mojaz' } });

    const result = await changeServicePrice(operator, 'mojaz', Number(service.price), null);
    expect(result.ok).toBe(true);
    expect(await db.auditLog.count({ where: { actorId: operator.id } })).toBe(0);

    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('تحرير بلا تغيير لا يُكتب قيدًا', async () => {
    const operator = await admin();
    const service = await db.service.findFirstOrThrow({ where: { key: 'mojaz' } });

    await editService(operator, 'mojaz', { nameAr: service.nameAr, descAr: service.descAr }, null);
    expect(await db.auditLog.count({ where: { actorId: operator.id } })).toBe(0);

    await editService(operator, 'mojaz', { nameAr: `${service.nameAr} ` }, null);
    expect(await db.auditLog.count({ where: { actorId: operator.id } })).toBe(1);

    await db.service.update({ where: { key: 'mojaz' }, data: { nameAr: service.nameAr } });
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('سعر سالب يُرفض، وخدمة مجهولة تُرفض', async () => {
    const operator = await admin();
    expect((await changeServicePrice(operator, 'inspection', -1, null)).ok).toBe(false);
    expect((await changeServicePrice(operator, 'nope', 100, null)).ok).toBe(false);
    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('عدّاد الطلبات القائمة يطابق الواقع', async () => {
    const services = await listServicesForAdmin();
    for (const service of services) {
      const row = await db.service.findUniqueOrThrow({ where: { key: service.key } });
      const real = await db.serviceRequest.count({
        where: { serviceId: row.id, status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS'] } },
      });
      expect(real, service.key).toBe(service.openRequests);
    }
  });
});

describe('A7 — الإنشاء والترتيب', () => {
  it('الخدمة الجديدة تُنشأ مخفيّة وفي آخر الترتيب', async () => {
    const operator = await admin();
    const key = `t${String(Date.now()).slice(-8)}`;

    const created = await createService(
      operator,
      {
        key, category: 'SELLER', nameAr: 'خدمة اختبار', nameEn: 'Test service',
        descAr: '', descEn: '', price: 99, slaHours: null, placements: [],
        adminFeeEnabled: true, adminFee: 25,
      },
      null,
    );
    expect(created.ok).toBe(true);

    const row = await db.service.findUniqueOrThrow({ where: { key } });
    // مخفيّة حتى تكتمل — لا تظهر في الدليل لحظة الإنشاء
    expect(row.active).toBe(false);
    const top = await db.service.findFirstOrThrow({ orderBy: { sort: 'desc' } });
    expect(top.key).toBe(key);

    /**
     * **الرسم الإداريّ يصل إلى الصفّ.** كانت الشاشة تعرض حقله في لوح
     * «خدمة جديدة» ويسقط في الطريق — مخطّطُ الطلب لا يقبله وما كان
     * يُكتب. فيقرأ المشغّل «أُنشئت» والمحفوظ صفر، ورسمٌ لنا تسقط
     * ضريبته معه.
     */
    expect(row.adminFeeEnabled).toBe(true);
    expect(Number(row.adminFee)).toBe(25);

    // والمفتاح لا يتكرّر
    const again = await createService(
      operator,
      {
        key, category: 'SELLER', nameAr: 'x', nameEn: 'x',
        descAr: '', descEn: '', price: 1, slaHours: null, placements: [],
        adminFeeEnabled: false, adminFee: 0,
      },
      null,
    );
    expect(again.ok).toBe(false);

    await db.service.delete({ where: { key } });
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('الترتيب يبدّل موضعين، والطرف لا يتحرّك', async () => {
    const operator = await admin();
    const before = await db.service.findMany({ orderBy: [{ sort: 'asc' }, { key: 'asc' }] });
    const first = before[0];
    const second = before[1];
    if (first === undefined || second === undefined) throw new Error('يلزم خدمتان');

    await moveService(operator, second.key, 'up', null);
    const after = await db.service.findMany({ orderBy: [{ sort: 'asc' }, { key: 'asc' }] });
    expect(after[0]?.key).toBe(second.key);
    expect(after[1]?.key).toBe(first.key);

    // الأوّل لا يصعد أكثر — وليس خطأً
    const edge = await moveService(operator, second.key, 'up', null);
    expect(edge.ok).toBe(true);

    await moveService(operator, first.key, 'up', null);
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });
});

describe('A6 — المهلة المتجاوزة بارزة', () => {
  it('المتجاوز يُعلَّم، والمنجَز لا يتأخّر', async () => {
    const service = await db.service.findFirstOrThrow();
    const user = await db.user.findFirstOrThrow();
    const stamp = String(Date.now()).slice(-9);

    const [late, done] = await Promise.all([
      db.serviceRequest.create({
        data: {
          ref: `SRV-L-${stamp}`, serviceId: service.id, userId: user.id,
          status: 'IN_PROGRESS', amount: 100, dueAt: hours(10), createdAt: T0,
        },
      }),
      db.serviceRequest.create({
        data: {
          ref: `SRV-D-${stamp}`, serviceId: service.id, userId: user.id,
          status: 'DONE', amount: 100, dueAt: hours(10), createdAt: T0,
        },
      }),
    ]);

    const rows = await listServiceRequests({}, hours(30));
    const lateRow = rows.find((row) => row.ref === late.ref);
    const doneRow = rows.find((row) => row.ref === done.ref);

    expect(lateRow?.overdue).toBe(true);
    expect(lateRow?.overdueHours).toBe(20);
    // تأخّرُ المنجَز انقضى بإنجازه
    expect(doneRow?.overdue).toBe(false);

    // وقبل حلول المهلة لا تأخّر
    const early = await listServiceRequests({}, hours(5));
    expect(early.find((row) => row.ref === late.ref)?.overdue).toBe(false);

    await db.serviceRequest.deleteMany({ where: { id: { in: [late.id, done.id] } } });
  });

  it('المتجاوز يتصدّر ولو كانت مهلة المنجَز أقدم', async () => {
    const service = await db.service.findFirstOrThrow();
    const user = await db.user.findFirstOrThrow();
    const stamp = String(Date.now()).slice(-9);

    // مُنجَز مهلته أقدم بكثير — الترتيب بـdueAt وحده كان يرفعه إلى القمّة
    const [ancient, mild, severe] = await Promise.all([
      db.serviceRequest.create({
        data: {
          ref: `SRV-A-${stamp}`, serviceId: service.id, userId: user.id,
          status: 'DONE', amount: 100, dueAt: hours(-500), createdAt: hours(-600),
        },
      }),
      db.serviceRequest.create({
        data: {
          ref: `SRV-M-${stamp}`, serviceId: service.id, userId: user.id,
          status: 'NEW', amount: 100, dueAt: hours(25), createdAt: T0,
        },
      }),
      db.serviceRequest.create({
        data: {
          ref: `SRV-S-${stamp}`, serviceId: service.id, userId: user.id,
          status: 'NEW', amount: 100, dueAt: hours(2), createdAt: T0,
        },
      }),
    ]);

    const rows = await listServiceRequests({}, hours(30));
    const at = (ref: string) => rows.findIndex((row) => row.ref === ref);

    expect(at(severe.ref)).toBeGreaterThanOrEqual(0);
    // الأشدّ تجاوزًا فوق الأخفّ، وكلاهما فوق المنجَز مهما قدُمت مهلته
    expect(at(severe.ref)).toBeLessThan(at(mild.ref));
    expect(at(mild.ref)).toBeLessThan(at(ancient.ref));
    expect(rows[0]?.overdue).toBe(true);

    await db.serviceRequest.deleteMany({
      where: { id: { in: [ancient.id, mild.id, severe.id] } },
    });
  });

  it('المرشِّح يعيد المتجاوز وحده', async () => {
    const all = await listServiceRequests({}, hours(30));
    const only = await listServiceRequests({ onlyOverdue: true }, hours(30));
    expect(only.every((row) => row.overdue)).toBe(true);
    expect(only.length).toBeLessThanOrEqual(all.length);
  });
});
