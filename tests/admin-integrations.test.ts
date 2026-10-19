import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hasProbe } from '@/lib/domain/integration-probes';
import { decryptSecret, encryptSecret, secretHint } from '@/lib/crypto/secrets';
import { existsSync } from 'node:fs';
import {
  activeSecret,
  connectionState,
  approveRotation,
  checkConnection,
  integrationSummary,
  listIntegrations,
  requestEnvSwitch,
  requestRotation,
} from '@/lib/domain/admin-integrations';
import { effectiveEnvironment } from '@/lib/domain/integration-env';

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

    // ولا حقل باسم يوحي بسرّ — في الصفّ ولا في بيئاته
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain('secretsEncrypted');
      expect(Object.keys(row)).not.toContain('secrets');
      for (const credential of row.credentials) {
        expect(Object.keys(credential)).not.toContain('secretsEncrypted');
      }
    }
  });

  it('التلميح مخزَّن نصًّا عاديًا — فالعرض لا يفكّ تشفيرًا', async () => {
    const requester = await admin('الطالب');
    const approver = await admin('المعتمِد');
    const integration = await db.integration.findFirstOrThrow();

    // نصابُ الواحد (قرار المالك ٢٠٢٦-١٠-١٤): الطلبُ يُدوّر في نداءٍ واحد
    await requestRotation(requester, integration.key, 'TEST', { apiKey: SECRET }, null);

    const row = (await listIntegrations()).find((entry) => entry.key === integration.key);
    const test = row?.credentials.find((entry) => entry.env === 'TEST');
    expect(test?.hints.apiKey).toBe(secretHint(SECRET));
    expect(test?.configured).toBe(true);
    // والبيئة الأخرى لم تُمَسّ — وهذا كل معنى الفصل
    expect(row?.credentials.find((entry) => entry.env === 'LIVE')?.configured).toBe(false);

    // والمخزَّن مشفَّر فعلًا
    const stored = await db.integrationCredential.findUniqueOrThrow({
      where: { integrationKey_env: { integrationKey: integration.key, env: 'TEST' } },
    });
    expect(stored.secretsEncrypted).not.toContain(SECRET);
    expect(decryptSecret(stored.secretsEncrypted ?? '')).toContain(SECRET);

    await db.integrationCredential.deleteMany({ where: { integrationKey: integration.key } });
    await db.approvalRequest.deleteMany({ where: { entityId: integration.key } });
    await db.auditLog.deleteMany({ where: { actorId: { in: [requester.id, approver.id] } } });
    await db.adminUser.deleteMany({ where: { id: { in: [requester.id, approver.id] } } });
  });

  it('سجلّ التدقيق يحمل التلميح لا السرّ', async () => {
    const requester = await admin('الطالب');
    const integration = await db.integration.findFirstOrThrow();

    await requestRotation(requester, integration.key, 'TEST', { apiKey: SECRET }, null);
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
  /**
   * ═══ ونصابُ الواحد (قرار المالك ٢٠٢٦-١٠-١٤) ═══
   *
   * كان هنا «الطالب لا يوافق على طلبه، والثاني ينفّذه» — قاعدةٌ
   * أُلغيت، **واختبارٌ يثبّتها يجعل تنفيذ القرار يبدو كسرًا**.
   */
  it('الطالب يُدوّر بنداءٍ واحد، والسرُّ يُخزَّن مشفَّرًا', async () => {
    const requester = await admin('الطالب');
    const approver = await admin('المعتمِد');
    const integration = await db.integration.findFirstOrThrow();
    await db.integrationCredential.deleteMany({ where: { integrationKey: integration.key } });

    const asked = await requestRotation(requester, integration.key, 'TEST', { apiKey: SECRET }, null);
    expect(asked.ok).toBe(true);
    if (asked.ok) expect(asked.state).toBe('EXECUTED');

    const rotated = await db.integrationCredential.findUniqueOrThrow({
      where: { integrationKey_env: { integrationKey: integration.key, env: 'TEST' } },
    });
    expect(rotated.secretsEncrypted).not.toBeNull();
    expect(decryptSecret(rotated.secretsEncrypted ?? '')).toContain(SECRET);

    const executed = await db.approvalRequest.findFirstOrThrow({
      where: { entityId: integration.key },
      orderBy: { id: 'desc' },
    });
    expect(executed.status).toBe('APPROVED');
    expect(executed.executedAt).not.toBeNull();

    await db.integrationCredential.deleteMany({ where: { integrationKey: integration.key } });
    await db.approvalRequest.deleteMany({ where: { entityId: integration.key } });
    await db.auditLog.deleteMany({ where: { actorId: { in: [requester.id, approver.id] } } });
    await db.adminUser.deleteMany({ where: { id: { in: [requester.id, approver.id] } } });
  });

  /**
   * **و«طلبان متزامنان» سقطت بسقوط سببها**: لا يبقى معلَّقٌ ليصطدم به
   * ثانٍ. والباقي أنّ التدويرين يقعان بالترتيب، وآخرُهما هو المخزَّن.
   */
  it('وتدويران متتاليان: آخرُهما هو المخزَّن', async () => {
    const first = await admin('الأوّل');
    const second = await admin('الثاني');
    const integration = await db.integration.findFirstOrThrow();

    expect((await requestRotation(first, integration.key, 'TEST', { apiKey: 'a' }, null)).ok).toBe(true);
    expect((await requestRotation(second, integration.key, 'TEST', { apiKey: 'b' }, null)).ok).toBe(true);

    const stored = await db.integrationCredential.findUniqueOrThrow({
      where: { integrationKey_env: { integrationKey: integration.key, env: 'TEST' } },
    });
    expect(decryptSecret(stored.secretsEncrypted ?? '')).toContain('b');

    await db.integrationCredential.deleteMany({ where: { integrationKey: integration.key } });

    await db.approvalRequest.deleteMany({ where: { entityId: integration.key } });
    await db.auditLog.deleteMany({ where: { actorId: { in: [first.id, second.id] } } });
    await db.adminUser.deleteMany({ where: { id: { in: [first.id, second.id] } } });
  });

  /**
   * **والانتهاءُ يُقاس بصفٍّ يُصنَع لا بطلبٍ ينتظر**: لم يعد يبقى
   * معلَّقٌ ليُصنَّع له انتهاء، فيُكتب الصفُّ منتهيًا ثمّ يُعتمد.
   */
  it('الطلب المنتهي لا يُنفَّذ ولو اعتُمد', async () => {
    const requester = await admin('الطالب');
    const approver = await admin('المعتمِد');
    const integration = await db.integration.findFirstOrThrow();
    await db.integrationCredential.deleteMany({ where: { integrationKey: integration.key } });

    const stale = await db.approvalRequest.create({
      data: {
        kind: 'KEY_ROTATION',
        entityType: 'Integration',
        entityId: integration.key,
        payload: { env: 'TEST', secrets: { apiKey: SECRET } },
        requestedBy: requester.id,
        approvedBy: [],
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const late = await approveRotation(approver, stale.id, null);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.reason).toBe('EXPIRED');

    const untouched = await db.integrationCredential.findUnique({
      where: { integrationKey_env: { integrationKey: integration.key, env: 'TEST' } },
    });
    expect(untouched).toBeNull();

    await db.approvalRequest.deleteMany({ where: { entityId: integration.key } });
    await db.auditLog.deleteMany({ where: { actorId: { in: [requester.id, approver.id] } } });
    await db.adminUser.deleteMany({ where: { id: { in: [requester.id, approver.id] } } });
  });
});

describe('A11 — الفحص لا يدّعي نجاحًا', () => {
  it('لا مزوّد بعد ⇒ لا نتيجة خضراء', async () => {
    const operator = await admin('المشغّل');
    /**
     * **والطقمُ يشترط ما يفترضه.** كان يأخذ `findFirstOrThrow()` بلا
     * ترتيب ويفترض أنّ أوّل صفٍّ بلا وصلة — فإذا وقع على
     * `moyasar_platform` ولها مفتاحٌ مضبوط جرت الوصلةُ فعلًا وكُتب
     * `false` مكان `null`. يمرّ وحده ويسقط بين جيرانه.
     *
     * و`hasProbe` تُسأل ولا يُكتب المفتاحُ بيد: وصلةٌ تُضاف غدًا
     * لتكاملٍ آخر لا تُعيد السقوط.
     */
    const candidates = await db.integration.findMany({
      orderBy: { key: 'asc' },
      select: { key: true, lastCheckAt: true, lastCheckOk: true },
    });
    const integration = candidates.find((row) => !hasProbe(row.key));
    if (integration === undefined) throw new Error('كلُّ التكاملات لها وصلة');

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

  /**
   * ═══ وهذا الاختبار كان يثبّت العطل ═══
   *
   * كان يفحص أن الملخّص **يطابق عدّ `status` المخزَّن** — أي يحرس
   * بالضبط السلوك الذي جعل بطاقة «تعمل» تعدّ ما زرعتْه البذرة. فلمّا
   * صار العدّ على الحال المحسوبة سقط، **والساقط كان الاختبار لا
   * الكود**.
   *
   * وبقي منه ما يستحقّ: القسمة تامّة، ولا صفّ يسقط بين الشقوق.
   */
  it('الحالات الثلاث تقسم التكاملات كلها', async () => {
    const summary = await integrationSummary();
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

describe('═══ قرار ٣٣ ═══ البيئتان منفصلتان، وstaging مقيَّد في الكود', () => {
  it('خارج الإنتاج تُقرأ TEST مهما كان المخزَّن', async () => {
    // الاختبارات تجري على APP_ENV=development
    expect(effectiveEnvironment('LIVE')).toBe('TEST');
    expect(effectiveEnvironment('TEST')).toBe('TEST');
  });

  it('السرّ الفعّال من بيئة الاختبار ولو كانت البوابة مخزَّنة على الإنتاج', async () => {
    const requester = await admin('الطالب');
    const approver = await admin('المعتمِد');
    const integration = await db.integration.findFirstOrThrow();

    await db.integrationCredential.deleteMany({ where: { integrationKey: integration.key } });
    // مفتاحان مختلفان في البيئتين
    await db.integrationCredential.createMany({
      data: [
        { integrationKey: integration.key, env: 'TEST', secretsEncrypted: 'TEST_SECRET_BLOB' },
        { integrationKey: integration.key, env: 'LIVE', secretsEncrypted: 'LIVE_SECRET_BLOB' },
      ],
    });
    await db.integration.update({ where: { key: integration.key }, data: { activeEnv: 'LIVE' } });

    // ═══ المخزَّن LIVE — والمقروء TEST، لأن القيد في الكود ═══
    expect(await activeSecret(integration.key)).toBe('TEST_SECRET_BLOB');

    const row = (await listIntegrations()).find((entry) => entry.key === integration.key);
    expect(row?.storedEnv).toBe('LIVE');
    expect(row?.activeEnv).toBe('TEST');
    // والشاشة تقولها ولا تُخفيها
    expect(row?.envForced).toBe(true);

    await db.integration.update({ where: { key: integration.key }, data: { activeEnv: 'TEST' } });
    await db.integrationCredential.deleteMany({ where: { integrationKey: integration.key } });
    await db.adminUser.deleteMany({ where: { id: { in: [requester.id, approver.id] } } });
  });

  it('كتابة مفتاح إنتاج من خارج الإنتاج تُرفض', async () => {
    const requester = await admin('الطالب');
    const integration = await db.integration.findFirstOrThrow();

    const live = await requestRotation(requester, integration.key, 'LIVE', { apiKey: SECRET }, null);
    expect(live.ok).toBe(false);
    if (!live.ok) expect(live.reason).toBe('ENV_FORBIDDEN');

    // ولا طلب موافقة كُتب — الرفض قبل كل شيء
    expect(
      await db.approvalRequest.count({ where: { entityId: integration.key, status: 'PENDING' } }),
    ).toBe(0);

    await db.auditLog.deleteMany({ where: { actorId: requester.id } });
    await db.adminUser.delete({ where: { id: requester.id } });
  });

  it('تبديل البيئة خارج الإنتاج لا معنى له فيُرفض', async () => {
    const requester = await admin('الطالب');
    const integration = await db.integration.findFirstOrThrow();

    const result = await requestEnvSwitch(requester, integration.key, 'LIVE', null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('ENV_FORBIDDEN');

    await db.adminUser.delete({ where: { id: requester.id } });
  });

  it('تدوير بيئة لا يمسّ الأخرى', async () => {
    const requester = await admin('الطالب');
    const approver = await admin('المعتمِد');
    const integration = await db.integration.findFirstOrThrow();

    await db.integrationCredential.deleteMany({ where: { integrationKey: integration.key } });
    await db.integrationCredential.create({
      data: { integrationKey: integration.key, env: 'LIVE', secretsEncrypted: 'LIVE_UNTOUCHED' },
    });

    // نصابُ الواحد (قرار المالك ٢٠٢٦-١٠-١٤): الطلبُ يُدوّر في نداءٍ واحد
    await requestRotation(requester, integration.key, 'TEST', { apiKey: SECRET }, null);

    const live = await db.integrationCredential.findUniqueOrThrow({
      where: { integrationKey_env: { integrationKey: integration.key, env: 'LIVE' } },
    });
    // ═══ تجربةٌ لا تكتب فوق مفتاح الإنتاج — وهو كل سبب الفصل ═══
    expect(live.secretsEncrypted).toBe('LIVE_UNTOUCHED');

    await db.integrationCredential.deleteMany({ where: { integrationKey: integration.key } });
    await db.approvalRequest.deleteMany({ where: { entityId: integration.key } });
    await db.auditLog.deleteMany({ where: { actorId: { in: [requester.id, approver.id] } } });
    await db.adminUser.deleteMany({ where: { id: { in: [requester.id, approver.id] } } });
  });
});

describe('A11 — الحال تُحسب ولا تُقرأ من حقلٍ لا يكتبه أحد', () => {
  /**
   * ═══ `Integration.status` بلا كاتب ═══
   *
   * معرَّفٌ في المخطّط ومفهرَسٌ ومقروء، **ولا شيء يكتبه بعد البذرة**.
   * فصفٌّ زُرع `ACTIVE` بلا مفتاحٍ واحد يبقى `ACTIVE` إلى الأبد —
   * وبطاقةُ «تعمل» تعدّه، **والسطر نفسه يعرض «بلا مفاتيح» وبجانبه
   * شارة «تعمل»**. وأشدُّها `otp_sms`: مسارُ دخول كل مستخدم، مزروعًا
   * `ACTIVE` بلا صفّ اعتماد واحد.
   */
  it('المفعَّل بلا مفاتيح ليس عاملًا', () => {
    expect(connectionState('ACTIVE', 'TEST', [{ env: 'TEST', configured: false }]))
      .toBe('NO_KEYS');
    expect(connectionState('ACTIVE', 'TEST', [])).toBe('NO_KEYS');
  });

  it('والمؤجَّل عن عمد حالٌ ثالثة لا تحذير', () => {
    // `r2` مؤجَّل بقرار — وعرضُه «تحذيرًا» يجعل القرار يبدو عطلًا
    expect(connectionState('INACTIVE', 'TEST', [{ env: 'TEST', configured: true }]))
      .toBe('OFF');
  });

  it('ومفتاحُ بيئةٍ أخرى لا يجعله عاملًا', () => {
    /**
     * خارج الإنتاج القراءة مثبَّتة على `TEST` — فمفتاح `LIVE` موجودًا
     * لا يُنادى، وعدُّه اتّصالًا يُطمئن على ما لا يعمل.
     */
    expect(
      connectionState('ACTIVE', 'TEST', [
        { env: 'TEST', configured: false },
        { env: 'LIVE', configured: true },
      ]),
    ).toBe('NO_KEYS');
  });

  it('والمفعَّل بمفتاح بيئته عامل', () => {
    expect(connectionState('ACTIVE', 'TEST', [{ env: 'TEST', configured: true }]))
      .toBe('READY');
  });

  it('والبطاقة والشارة من دالّة واحدة — فلا تتباعدان', async () => {
    const [rows, summary] = await Promise.all([listIntegrations(), integrationSummary()]);
    const counted = (state: string): number =>
      rows.filter((row) => row.connection === state).length;

    expect(summary.connected).toBe(counted('READY'));
    expect(summary.warning).toBe(counted('NO_KEYS'));
    expect(summary.inactive).toBe(counted('OFF'));
  });
});

describe('A11 — وجهة الويبهوك تُعرض، ومن مسارٍ قائم', () => {
  /**
   * **والعنوان يُفحص لا يُكتب على حسن النيّة.** مسارٌ يُنقل أو يُعاد
   * تسميته يترك في الشاشة عنوانًا يُنسخ إلى لوحة المزوّد فلا يصل
   * تأكيدُ دفعةٍ واحدة — **ولا خطأ في أيّ سجلّ عندنا**، لأن النداء
   * لا يبلغنا أصلًا. فالفحص على وجود ملفّ المسار.
   */
  it('كل وجهة معروضة لها ملفّ مسار', async () => {
    const rows = await listIntegrations();
    const shown = rows.filter((row) => row.webhookUrl !== null);
    expect(shown.length).toBeGreaterThan(0);

    for (const row of shown) {
      const path = new URL(row.webhookUrl ?? '').pathname;
      expect(existsSync(`src/app${path}/route.ts`), `${row.key} ⇐ ${path}`).toBe(true);
    }
  });
});
