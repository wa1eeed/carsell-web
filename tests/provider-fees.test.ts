import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto/secrets';
import { feeMatrixFromPercent } from '@/lib/payments/provider-platform';
import type {
  AccountDraft,
  AccountState,
  ProviderPlatformPort,
} from '@/lib/payments/provider-platform';
import {
  getProviderFeePlan,
  providerFeeMatrix,
  setProviderFeePlan,
} from '@/lib/domain/provider-fees';
import { setGatewayFees } from '@/lib/domain/payment-routing';
import { readCapabilities } from '@/lib/payments/gateway';
import {
  openProviderAccount,
  saveAccountFile,
  syncProviderAccount,
} from '@/lib/domain/provider-account';
import type { AdminUser } from '@/generated/prisma/client';

/**
 * ═══ الرسوم من اللوحة لا من الشيفرة ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٤): «مصفوفة الرسوم سواء للمزوّدين أو لبوابة
 * الدفع يجب أن تكون قابلة للضبط من لوحة التحكّم… فالرسوم تُضبط من
 * لوحة الأدمن ولا نضعها داخل الكود».
 *
 * وأخطرُ ما يحرسه هذا الملفّ **تحويلُ المئويّة إلى كسر**: البوّابة
 * تحدّ الكسر بواحد، فـ`1.70` تردّ ٤٠٠ — ومثالُ وثيقتها يكتب `1.70`
 * ويسمّيه «نسبة». ولو كان الحدُّ أوسع لمرّ رسمٌ **مئةَ ضعف** على
 * شريك، ولا يكشفه نوعٌ ولا اختبارٌ على خادمٍ وهميّ.
 */

const PLAN = {
  madaPct: 1.7,
  madaFixed: 1,
  madaCap: 30,
  madaRefundFixed: 1,
  cardPct: 2.75,
  cardFixed: 1,
  cardRefundFixed: 1,
  taxInclusive: false,
};

/** الحقولُ المُضافة تبدأ `NULL` — والاختبار يعيد ما غيّره. */
const FEE_COLUMNS = {
  providerFeeMadaPct: null,
  providerFeeMadaFixed: null,
  providerFeeMadaCap: null,
  providerFeeMadaRefundFixed: null,
  providerFeeCardPct: null,
  providerFeeCardFixed: null,
  providerFeeCardRefundFixed: null,
  providerFeeTaxInclusive: false,
};

let admin: AdminUser;
const madeProviders: string[] = [];

beforeEach(async () => {
  admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
});

afterEach(async () => {
  await db.platformSetting.update({ where: { id: 'default' }, data: FEE_COLUMNS });
  await db.auditLog.deleteMany({
    where: { action: { in: ['payments.provider_fees_changed', 'payments.gateway_fees_changed'] } },
  });
  if (madeProviders.length > 0) {
    await db.auditLog.deleteMany({ where: { entityId: { in: madeProviders } } });
    await db.serviceProvider.deleteMany({ where: { id: { in: madeProviders } } });
    madeProviders.length = 0;
  }
});

afterAll(async () => {
  await db.$disconnect();
});

/** مزوّدٌ خاصٌّ بالاختبار — ولا يُلمس مزوّدٌ مزروع يقرؤه طابورُ الإسناد. */
async function provider(): Promise<string> {
  const row = await db.serviceProvider.create({
    data: {
      nameAr: 'مركز فحص للاختبار',
      /** تسعةُ أرقامٍ في `nameEn` = صفُّ اختبار، تنظيفُه في `global-setup`. */
      nameEn: `Fee Test ${String(Date.now())}`,
      type: 'INSPECTION',
      contactEmail: 'centre@example.com',
      cities: ['الرياض'],
      active: true,
    },
    select: { id: true },
  });
  madeProviders.push(row.id);
  return row.id;
}

const STATE: AccountState = {
  accountRef: 'acc_test_1',
  requiredDocuments: [
    { type: 'commercial_registration', requiresUpload: true, count: 1 },
    { type: 'owner_id', requiresUpload: true, count: 2 },
  ],
  payoutRef: 'ent_test_1',
  status: 'PENDING',
  note: null,
  signatureUrl: null,
  documentsComplete: false,
  secretKey: 'sk_account_secret_value',
};

/** بوّابةٌ وهميّة **تحتفظ بالمسوّدة** — فما أُرسل هو ما يُفحص. */
function fakePort(state: AccountState = STATE): {
  port: ProviderPlatformPort;
  sent: AccountDraft[];
} {
  const sent: AccountDraft[] = [];
  const refuse = { ok: false as const, reason: 'NOT_CONFIGURED' as const, message: null };
  return {
    sent,
    port: {
      key: 'fake',
      platformPayoutRef: () => Promise.resolve({ ok: true, value: 'plat_1' }),
      openAccount: (draft) => {
        sent.push(draft);
        return Promise.resolve({ ok: true, value: state });
      },
      accountState: () => Promise.resolve({ ok: true, value: { ...state, status: 'ACTIVE' } }),
      submitForReview: () =>
        Promise.resolve({ ok: true, value: { ...state, status: 'UNDER_REVIEW' } }),
      balance: () => Promise.resolve(refuse),
      listAccounts: () => Promise.resolve({ ok: true, value: [state] }),
      checkShares: () => ({ ok: true, value: true }),
    },
  };
}

describe('═══ المئويّة إلى كسر ═══ موضعٌ واحد، وخطؤه مئةُ ضعف', () => {
  it('١٬٧٠٪ تُرسَل كسرًا لا نسبةً — وهو ما ردّته البوّابة ٤٠٠ عليه', () => {
    const matrix = feeMatrixFromPercent({
      madaPct: '1.70',
      madaFixed: '1',
      madaCap: null,
      madaRefundFixed: '1',
      cardPct: '2.75',
      cardFixed: '1',
      cardRefundFixed: '1',
      taxInclusive: false,
    });
    expect(matrix.madaRate).toBe('0.01700');
    expect(matrix.cardRate).toBe('0.02750');
    /** **والحدُّ واحد**: أيُّ كسرٍ أكبر منه يُرفض عند البوّابة. */
    expect(Number(matrix.madaRate)).toBeLessThanOrEqual(1);
  });

  it('والسقفُ يُحذف حين لا سقف — وإرسالُ صفرٍ يعني سقفًا بصفر', () => {
    const base = {
      madaPct: '1',
      madaFixed: '1',
      madaRefundFixed: '1',
      cardPct: '1',
      cardFixed: '1',
      cardRefundFixed: '1',
      taxInclusive: true,
    };
    expect(feeMatrixFromPercent({ ...base, madaCap: null }).madaCap).toBeUndefined();
    expect(feeMatrixFromPercent({ ...base, madaCap: '30' }).madaCap).toBe('30.00');
  });

  it('وثلاثُ خاناتٍ من المئويّة تبقى خمسًا في الكسر', () => {
    const matrix = feeMatrixFromPercent({
      madaPct: '0.125',
      madaFixed: '0',
      madaCap: null,
      madaRefundFixed: '0',
      cardPct: '0',
      cardFixed: '0',
      cardRefundFixed: '0',
      taxInclusive: false,
    });
    expect(matrix.madaRate).toBe('0.00125');
  });
});

describe('═══ المصفوفة ═══ تُضبط من اللوحة، و`null` ليست صفرًا', () => {
  it('غير مضبوطة ⇒ لا مصفوفة تُرسَل', async () => {
    const plan = await getProviderFeePlan();
    expect(plan.configured).toBe(false);
    expect(await providerFeeMatrix()).toBeNull();
  });

  it('وتُحفظ فتُقرأ مئويّةً وتُرسَل كسرًا', async () => {
    const saved = await setProviderFeePlan(admin, PLAN, null);
    expect(saved.ok).toBe(true);

    const plan = await getProviderFeePlan();
    expect(plan.configured).toBe(true);
    /** المخزَّن مئويّةٌ يقرؤها المشغّل — فلو خُزّن كسرًا قرأه نسبةً. */
    expect(Number(plan.madaPct)).toBe(1.7);

    const matrix = await providerFeeMatrix();
    expect(matrix?.madaRate).toBe('0.01700');
  });

  it('ونسبةٌ فوق المئة تُردّ — والحدُّ مئةٌ لا واحد', async () => {
    const tooBig = await setProviderFeePlan(admin, { ...PLAN, madaPct: 120 }, null);
    expect(tooBig.ok).toBe(false);
    /** **و«١٬٧٠» مقبولة**: حدٌّ بواحدٍ يمنع الشرط الشائع. */
    const fine = await setProviderFeePlan(admin, { ...PLAN, madaPct: 1.7 }, null);
    expect(fine.ok).toBe(true);
  });

  it('وكلُّ حفظٍ يكتب سجلّ تدقيق', async () => {
    await setProviderFeePlan(admin, PLAN, '10.0.0.1');
    const log = await db.auditLog.findFirst({
      where: { action: 'payments.provider_fees_changed' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.entityId).toBe('default');
    expect(log?.actorId).toBe(admin.id);
  });
});

describe('═══ رسوم البوّابة ═══ تُعدَّل بلا نشر، والرايات لا', () => {
  it('تُحفظ الرسوم وتبقى الرايات والمدّة كما هي', async () => {
    const before = readCapabilities(
      (await db.paymentGateway.findUniqueOrThrow({ where: { key: 'moyasar' } })).capabilities,
    );

    const result = await setGatewayFees(admin, 'moyasar', { feePct: 3.1, feeFixed: 2 }, null);
    expect(result.ok).toBe(true);

    const after = readCapabilities(
      (await db.paymentGateway.findUniqueOrThrow({ where: { key: 'moyasar' } })).capabilities,
    );
    expect(after.feePct).toBe(3.1);
    expect(after.feeFixed).toBe(2);
    /** **ولا تُمنح قدرةٌ بيد**: الرايات حقائقُ شيفرةٍ لا شروطَ عقد. */
    expect(after.supportsHold).toBe(before.supportsHold);
    expect(after.maxHoldDays).toBe(before.maxHoldDays);

    await db.paymentGateway.update({
      where: { key: 'moyasar' },
      data: { capabilities: { ...before } },
    });
  });

  it('وبوابةٌ لا وجود لها تُردّ ٤٠٤ لا ٤٢٢', async () => {
    const result = await setGatewayFees(admin, 'no_such_gateway', { feePct: 1, feeFixed: 0 }, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_FOUND');
  });
});

describe('═══ فتحُ الحساب ═══ الطرفُ الثاني للمصفوفة', () => {
  const FILE = {
    kind: 'ESTABLISHMENT' as const,
    slug: 'test_centre',
    website: '',
    adminEmail: 'owner@example.com',
    owners: 1,
    signatory: 'OWNER' as const,
    signatoryCount: null,
    licence: false,
  };

  it('بلا مصفوفةٍ مقرَّرة لا يُفتح حساب — ولا تُرسَل أصفار', async () => {
    const id = await provider();
    await saveAccountFile(admin, id, FILE, null);

    const { port, sent } = fakePort();
    const result = await openProviderAccount(admin, id, null, port);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NO_FEES');
    /** **ولم يُنادَ المزوّد أصلًا** — فالرفض عندنا لا عنده. */
    expect(sent).toHaveLength(0);
  });

  it('وبلا ملفّ تسجيلٍ كامل لا يُفتح', async () => {
    const id = await provider();
    await setProviderFeePlan(admin, PLAN, null);

    const { port } = fakePort();
    const result = await openProviderAccount(admin, id, null, port);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('FILE_INCOMPLETE');
  });

  it('ويُرسَل **الكسرُ** إلى البوّابة لا المئويّة', async () => {
    const id = await provider();
    await setProviderFeePlan(admin, PLAN, null);
    await saveAccountFile(admin, id, FILE, null);

    const { port, sent } = fakePort();
    const result = await openProviderAccount(admin, id, null, port);
    expect(result.ok).toBe(true);

    expect(sent).toHaveLength(1);
    const draft = sent[0];
    /**
     * **هذا هو الاختبار الذي يمنع الرسم المئةَ ضعف.** المشغّل كتب
     * «١٬٧٠٪»، والمُرسَل `0.01700` — ولو مرّت المئويّة كما هي لخُصم من
     * الشريك مئةُ أضعاف ما اتّفق عليه.
     */
    expect(draft?.fees.madaRate).toBe('0.01700');
    expect(draft?.fees.cardRate).toBe('0.02750');
    expect(draft?.fees.madaCap).toBe('30.00');
    expect(draft?.publicName).toBe('مركز فحص للاختبار');
    expect(draft?.adminEmail).toBe('owner@example.com');
  });

  it('ويُحفظ المعرّفان والسرُّ مُعمّى ولقطةُ الشروط', async () => {
    const id = await provider();
    await setProviderFeePlan(admin, PLAN, null);
    await saveAccountFile(admin, id, FILE, null);

    const { port } = fakePort();
    expect((await openProviderAccount(admin, id, null, port)).ok).toBe(true);

    const row = await db.serviceProvider.findUniqueOrThrow({ where: { id } });
    expect(row.accountRef).toBe('acc_test_1');
    /** **والمعرّفان لا يتبادلان**: الأوّل للإدارة والثاني للتحويل. */
    expect(row.payoutRef).toBe('ent_test_1');
    expect(row.accountStatus).toBe('PENDING');

    /** السرُّ مُعمّى — ونصُّه لا يظهر في العمود ولا في السجلّ. */
    expect(row.accountSecret).not.toBe('sk_account_secret_value');
    expect(decryptSecret(row.accountSecret ?? '')).toBe('sk_account_secret_value');
    const log = await db.auditLog.findFirstOrThrow({
      where: { entityId: id, action: 'provider.account_opened' },
    });
    expect(JSON.stringify(log.after)).not.toContain('sk_account_secret_value');

    /** ولقطةُ الشروط كسرٌ كما أُرسل — لا مصفوفةُ اليوم. */
    expect(JSON.stringify(row.accountFees)).toContain('0.01700');
  });

  it('ولا يُفتح حسابٌ ثانٍ لمن له حساب', async () => {
    const id = await provider();
    await setProviderFeePlan(admin, PLAN, null);
    await saveAccountFile(admin, id, FILE, null);

    const { port } = fakePort();
    expect((await openProviderAccount(admin, id, null, port)).ok).toBe(true);
    const again = await openProviderAccount(admin, id, null, port);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('ALREADY_OPEN');
  });

  it('وملفُّ حسابٍ مفتوحٍ لا يُعدَّل — فما عند البوّابة لا يتغيّر عندنا', async () => {
    const id = await provider();
    await setProviderFeePlan(admin, PLAN, null);
    await saveAccountFile(admin, id, FILE, null);
    const { port } = fakePort();
    await openProviderAccount(admin, id, null, port);

    const edit = await saveAccountFile(admin, id, { ...FILE, slug: 'other_name' }, null);
    expect(edit.ok).toBe(false);
    if (!edit.ok) expect(edit.reason).toBe('ALREADY_OPEN');
  });

  it('والاسمُ الآليّ يُفحص عندنا قبل أن ترفضه البوّابة', async () => {
    const id = await provider();
    const bad = await saveAccountFile(admin, id, { ...FILE, slug: 'Bad Name!' }, null);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('SLUG');
  });

  it('وعددُ الموقّعين مطلوبٌ حين لا يكون التوقيع للمالك', async () => {
    const id = await provider();
    const bad = await saveAccountFile(
      admin,
      id,
      { ...FILE, signatory: 'POWER_OF_ATTORNEY', signatoryCount: null },
      null,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('SIGNATORY_COUNT');
  });

  it('والمزامنةُ تكتب حالَ البوّابة عندنا — وبها يدخل طابورَ الإسناد', async () => {
    const id = await provider();
    await setProviderFeePlan(admin, PLAN, null);
    await saveAccountFile(admin, id, FILE, null);
    const { port } = fakePort();
    await openProviderAccount(admin, id, null, port);

    const synced = await syncProviderAccount(admin, id, null, port);
    expect(synced.ok).toBe(true);
    const row = await db.serviceProvider.findUniqueOrThrow({ where: { id } });
    expect(row.accountStatus).toBe('ACTIVE');
    /** **والتغيُّر وحده يُسجَّل** — مزامنةٌ بلا تغيير سطرٌ في سجلٍّ يُقرأ. */
    const logs = await db.auditLog.count({
      where: { entityId: id, action: 'provider.account_synced' },
    });
    expect(logs).toBe(1);
    await syncProviderAccount(admin, id, null, port);
    expect(
      await db.auditLog.count({ where: { entityId: id, action: 'provider.account_synced' } }),
    ).toBe(1);
  });

  it('ومن لا حسابَ له لا يُزامَن', async () => {
    const id = await provider();
    const { port } = fakePort();
    const result = await syncProviderAccount(admin, id, null, port);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NO_ACCOUNT');
  });
});
