import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { decryptSecret, encryptSecret, secretHint } from '@/lib/crypto/secrets';
import {
  approveRotation,
  checkConnection,
  integrationSummary,
  listIntegrations,
  requestRotation,
} from '@/lib/domain/admin-integrations';

afterAll(async () => {
  await db.$disconnect();
});

let seq = 0;
async function admin(name: string) {
  seq += 1;
  return db.adminUser.create({
    data: {
      email: `itg${String(Date.now()).slice(-8)}${String(seq)}@carsell.one`,
      name, role: 'SUPER_ADMIN', passwordHash: 'x',
    },
  });
}

/**
 * قيمة اختبار **لا تشبه مفتاحًا حقيقيًا عمدًا**.
 *
 * قيمةٌ على شكل `sk_live_<hex>` توقفها ماسحات الأسرار في كل دفعة، ثم
 * يعتاد الفريق على الضغط على «اسمح» — فتمرّ الحقيقية معها يومًا.
 */
const SECRET = 'TEST-NOT-A-REAL-KEY-0000-rotation-fixture';

describe('التشفير', () => {
  it('يعود كما دخل، ونصّه المشفَّر لا يحتوي الأصل', () => {
    const payload = encryptSecret(SECRET);
    expect(payload).not.toContain(SECRET);
    expect(payload).not.toContain('NOT-A-REAL-KEY');
    expect(decryptSecret(payload)).toBe(SECRET);
  });

  it('كل تشفيرة مختلفة — ولا يُستدلّ على التكرار', () => {
    expect(encryptSecret(SECRET)).not.toBe(encryptSecret(SECRET));
  });

  it('العبث يُكشف ولا يُفكّ إلى قمامة', () => {
    const payload = encryptSecret(SECRET);
    const parts = payload.split('.');
    const data = Buffer.from(parts[3] ?? '', 'base64url');
    data[0] = (data[0] ?? 0) ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], data.toString('base64url')].join('.');

    expect(() => decryptSecret(tampered)).toThrow();
    expect(() => decryptSecret('v1.a.b.c')).toThrow();
    expect(() => decryptSecret('نصّ عشوائي')).toThrow();
  });

  it('التلميح يكشف البادئة وحدها', () => {
    const hint = secretHint(SECRET);
    expect(hint.startsWith('TEST-NOT')).toBe(true);
    expect(hint).not.toContain('rotation-fixture');
    expect(hint.length).toBeLessThan(SECRET.length + 20);
  });
});

describe('═══ معيار A11 ═══ المفاتيح لا تُعرض', () => {
  it('لا سرّ ولا نصّ مشفَّر في ما تُعيده القائمة', async () => {
    const rows = await listIntegrations();
    expect(rows.length).toBeGreaterThan(0);

    const payload = JSON.stringify(rows);
    expect(payload).not.toContain('secretsEncrypted');
    expect(payload).not.toContain('v1.');

    // ولا حقل باسم يوحي بسرّ
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain('secretsEncrypted');
      expect(Object.keys(row)).not.toContain('secrets');
    }
  });

  it('التلميح مخزَّن نصًّا عاديًا — فالعرض لا يفكّ تشفيرًا', async () => {
    const requester = await admin('الطالب');
    const approver = await admin('المعتمِد');
    const integration = await db.integration.findFirstOrThrow();

    await requestRotation(requester, integration.key, { apiKey: SECRET }, null);
    const request = await db.approvalRequest.findFirstOrThrow({
      where: { entityId: integration.key, status: 'PENDING' },
    });
    await approveRotation(approver, request.id, null);

    const row = (await listIntegrations()).find((entry) => entry.key === integration.key);
    expect(row?.secretHints.apiKey).toBe(secretHint(SECRET));
    expect(row?.hasSecrets).toBe(true);

    // والمخزَّن مشفَّر فعلًا
    const stored = await db.integration.findUniqueOrThrow({ where: { key: integration.key } });
    expect(stored.secretsEncrypted).not.toContain(SECRET);
    expect(decryptSecret(stored.secretsEncrypted ?? '')).toContain(SECRET);

    await db.integration.update({
      where: { key: integration.key },
      data: { secretsEncrypted: integration.secretsEncrypted, configPublic: integration.configPublic ?? {} },
    });
    await db.approvalRequest.deleteMany({ where: { entityId: integration.key } });
    await db.auditLog.deleteMany({ where: { actorId: { in: [requester.id, approver.id] } } });
    await db.adminUser.deleteMany({ where: { id: { in: [requester.id, approver.id] } } });
  });

  it('سجلّ التدقيق يحمل التلميح لا السرّ', async () => {
    const requester = await admin('الطالب');
    const integration = await db.integration.findFirstOrThrow();

    await requestRotation(requester, integration.key, { apiKey: SECRET }, null);
    const entry = await db.auditLog.findFirstOrThrow({ where: { actorId: requester.id } });
    const written = JSON.stringify(entry.after);

    expect(written).not.toContain(SECRET);
    expect(written).not.toContain('v1.');
    expect(written).toContain('TEST-NOT');

    await db.approvalRequest.deleteMany({ where: { entityId: integration.key } });
    await db.auditLog.deleteMany({ where: { actorId: requester.id } });
    await db.adminUser.delete({ where: { id: requester.id } });
  });
});

describe('═══ معيار A11 ═══ التدوير بموافقة عضوين', () => {
  it('الطالب لا يوافق على طلبه، والثاني ينفّذه', async () => {
    const requester = await admin('الطالب');
    const approver = await admin('المعتمِد');
    const integration = await db.integration.findFirstOrThrow();
    const original = integration.secretsEncrypted;

    const asked = await requestRotation(requester, integration.key, { apiKey: SECRET }, null);
    expect(asked.ok).toBe(true);
    if (asked.ok && asked.state === 'PENDING') expect(asked.required).toBe(2);

    // لم يتغيّر شيء بعد — الطلب وحده ليس تدويرًا
    const midway = await db.integration.findUniqueOrThrow({ where: { key: integration.key } });
    expect(midway.secretsEncrypted).toBe(original);

    const request = await db.approvalRequest.findFirstOrThrow({
      where: { entityId: integration.key, status: 'PENDING' },
    });

    // ═══ الطالب يوافق على نفسه ⇒ يُرفض ═══
    const self = await approveRotation(requester, request.id, null);
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.reason).toBe('SELF_APPROVAL');

    const stillUnchanged = await db.integration.findUniqueOrThrow({ where: { key: integration.key } });
    expect(stillUnchanged.secretsEncrypted).toBe(original);

    // ═══ عضو ثانٍ ⇒ يُنفَّذ ═══
    const second = await approveRotation(approver, request.id, null);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.state).toBe('EXECUTED');

    const rotated = await db.integration.findUniqueOrThrow({ where: { key: integration.key } });
    expect(rotated.secretsEncrypted).not.toBe(original);
    expect(decryptSecret(rotated.secretsEncrypted ?? '')).toContain(SECRET);

    const executed = await db.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(executed.status).toBe('APPROVED');
    expect(executed.executedAt).not.toBeNull();

    await db.integration.update({
      where: { key: integration.key },
      data: { secretsEncrypted: original, configPublic: integration.configPublic ?? {} },
    });
    await db.approvalRequest.deleteMany({ where: { entityId: integration.key } });
    await db.auditLog.deleteMany({ where: { actorId: { in: [requester.id, approver.id] } } });
    await db.adminUser.deleteMany({ where: { id: { in: [requester.id, approver.id] } } });
  });

  it('طلبان متزامنان لا يجتمعان على مفتاح واحد', async () => {
    const first = await admin('الأوّل');
    const second = await admin('الثاني');
    const integration = await db.integration.findFirstOrThrow();

    expect((await requestRotation(first, integration.key, { apiKey: 'a' }, null)).ok).toBe(true);
    const clash = await requestRotation(second, integration.key, { apiKey: 'b' }, null);
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.reason).toBe('ALREADY_PENDING');

    await db.approvalRequest.deleteMany({ where: { entityId: integration.key } });
    await db.auditLog.deleteMany({ where: { actorId: { in: [first.id, second.id] } } });
    await db.adminUser.deleteMany({ where: { id: { in: [first.id, second.id] } } });
  });

  it('الطلب المنتهي لا يُنفَّذ ولو وافق عضو ثانٍ', async () => {
    const requester = await admin('الطالب');
    const approver = await admin('المعتمِد');
    const integration = await db.integration.findFirstOrThrow();
    const original = integration.secretsEncrypted;

    await requestRotation(requester, integration.key, { apiKey: SECRET }, null);
    const request = await db.approvalRequest.findFirstOrThrow({
      where: { entityId: integration.key, status: 'PENDING' },
    });
    await db.approvalRequest.update({
      where: { id: request.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const late = await approveRotation(approver, request.id, null);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.reason).toBe('EXPIRED');

    const untouched = await db.integration.findUniqueOrThrow({ where: { key: integration.key } });
    expect(untouched.secretsEncrypted).toBe(original);

    await db.approvalRequest.deleteMany({ where: { entityId: integration.key } });
    await db.auditLog.deleteMany({ where: { actorId: { in: [requester.id, approver.id] } } });
    await db.adminUser.deleteMany({ where: { id: { in: [requester.id, approver.id] } } });
  });
});

describe('A11 — الفحص لا يدّعي نجاحًا', () => {
  it('لا مزوّد بعد ⇒ لا نتيجة خضراء', async () => {
    const operator = await admin('المشغّل');
    const integration = await db.integration.findFirstOrThrow();

    const result = await checkConnection(operator, integration.key, null);
    expect(result.ok).toBe(true);

    const row = await db.integration.findUniqueOrThrow({ where: { key: integration.key } });
    // `null` لا `true`: الأخضر بلا اتّصال حقيقي يُطمئن كذبًا
    expect(row.lastCheckOk).toBeNull();
    expect(row.lastCheckAt).not.toBeNull();

    await db.integration.update({
      where: { key: integration.key },
      data: { lastCheckAt: integration.lastCheckAt, lastCheckOk: integration.lastCheckOk },
    });
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('الملخّص يطابق الحالات الفعلية', async () => {
    const summary = await integrationSummary();
    const real = {
      connected: await db.integration.count({ where: { status: 'ACTIVE' } }),
      warning: await db.integration.count({ where: { status: 'DEGRADED' } }),
      inactive: await db.integration.count({ where: { status: 'INACTIVE' } }),
    };
    expect(summary.connected).toBe(real.connected);
    expect(summary.warning).toBe(real.warning);
    expect(summary.inactive).toBe(real.inactive);
    // ومجموعها كل التكاملات — لا حالة تسقط بين الشقوق
    expect(summary.connected + summary.warning + summary.inactive).toBe(
      await db.integration.count(),
    );
  });

  it('لكل تكامل سلوك تعطّل معلن — لا شاشة خطأ بلا مخرج', async () => {
    for (const row of await listIntegrations()) {
      expect(row.failureBehavior, row.key).not.toBe('');
    }
  });
});
