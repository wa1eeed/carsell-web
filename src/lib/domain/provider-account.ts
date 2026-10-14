import { db } from '@/lib/db';
import type { AdminUser } from '@/generated/prisma/client';
import type { AccountSignatory, ProviderAccountKind } from '@/generated/prisma/enums';
import { decryptSecret, encryptSecret } from '@/lib/crypto/secrets';
import type {
  AccountDraft,
  AccountState,
  ProviderPlatformPort,
} from '@/lib/payments/provider-platform';
import { activeSecret } from './admin-integrations';
import { providerFeeMatrix } from './provider-fees';

/**
 * ═══ فتحُ حساب الدفع للمزوّد — الطرفُ الثاني للمصفوفة ═══
 *
 * `openAccount` كان مبنيًّا مختبَرًا **ومُثبَتًا بنداءٍ حقيقيّ**، ولا
 * شيء في المنتج كلّه ينادِيه: لا زرّ ولا مسار. و`accountStatus` لا
 * كاتبَ له خارج البذرة، و`cityPool` تشترط `ACTIVE` أو `SEMI_ACTIVE` —
 * **فمزوّدٌ يُضاف من اللوحة لا يصله طلبٌ أبدًا**، وهو العطل الذي لا
 * يظهر إلّا لمن يفتح الشاشة ويضغط.
 *
 * ومصفوفةُ الرسوم مدخلٌ إلزاميّ لهذا النداء، فبناؤها بلا ناديها يُنتج
 * شاشةً تضبط ما لا يقرؤه أحد.
 */

export const PLATFORM_INTEGRATION_KEY = 'moyasar_platform';

/**
 * ملفُّ التسجيل — سبعةُ حقولٍ تطلبها الجهة المنظِّمة.
 *
 * ويُحفظ قبل الفتح لا معه: المشغّل يجمعها من الشريك على مهل، ويفتح
 * الحساب حين تكتمل. وفتحُها في نافذةٍ واحدة مع الفتح يجعل كل نقصٍ
 * يُلغي المحاولة كلّها.
 */
export type AccountFile = {
  kind: ProviderAccountKind | null;
  slug: string;
  website: string;
  adminEmail: string;
  owners: number | null;
  signatory: AccountSignatory | null;
  signatoryCount: number | null;
  licence: boolean;
};

export type AccountFileInput = {
  kind: ProviderAccountKind;
  slug: string;
  website: string;
  adminEmail: string;
  owners: number;
  signatory: AccountSignatory;
  signatoryCount: number | null;
  licence: boolean;
};

/** `^[a-z0-9_]+$` — البوّابة ترفض غيره، فيُفحص عندنا قبل أن تُرفض محاولة. */
const SLUG = /^[a-z0-9_]{3,40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkAccountFile(input: AccountFileInput): string | null {
  if (!SLUG.test(input.slug)) return 'SLUG';
  if (!EMAIL.test(input.adminEmail)) return 'ADMIN_EMAIL';
  if (!Number.isInteger(input.owners) || input.owners < 1 || input.owners > 50) return 'OWNERS';
  if (
    input.signatory !== 'OWNER' &&
    (input.signatoryCount === null || input.signatoryCount < 1 || input.signatoryCount > 50)
  ) {
    return 'SIGNATORY_COUNT';
  }
  if (input.website !== '' && !input.website.startsWith('http')) return 'WEBSITE';
  return null;
}

export async function saveAccountFile(
  admin: AdminUser,
  providerId: string,
  input: AccountFileInput,
  ip: string | null,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const invalid = checkAccountFile(input);
  if (invalid !== null) return { ok: false, reason: invalid };

  const provider = await db.serviceProvider.findUnique({
    where: { id: providerId },
    select: { id: true, accountRef: true },
  });
  if (provider === null) return { ok: false, reason: 'NOT_FOUND' };
  /**
   * **ولا يُعدَّل ملفُّ حسابٍ مفتوح.** ما عند البوّابة لا يتغيّر بتعديلٍ
   * عندنا، فتعديلُه هنا يجعل الشاشة تقول غير ما سُجِّل هناك.
   */
  if (provider.accountRef !== null) return { ok: false, reason: 'ALREADY_OPEN' };

  await db.serviceProvider.update({
    where: { id: providerId },
    data: {
      accountKind: input.kind,
      accountSlug: input.slug,
      accountWebsite: input.website,
      accountAdminEmail: input.adminEmail,
      accountOwners: input.owners,
      accountSignatory: input.signatory,
      accountSignatoryCount: input.signatory === 'OWNER' ? null : input.signatoryCount,
      accountLicence: input.licence,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'ServiceProvider',
      entityId: providerId,
      action: 'provider.account_file_saved',
      after: { ...input },
      ip,
      createdAt: now,
    },
  });

  return { ok: true };
}

export type OpenFailure =
  | 'NOT_FOUND'
  | 'ALREADY_OPEN'
  | 'FILE_INCOMPLETE'
  | 'NO_FEES'
  | 'NO_EMAIL'
  | 'NOT_CONFIGURED'
  | 'UPSTREAM';

export type OpenResult =
  | { ok: true; state: AccountState }
  | { ok: false; reason: OpenFailure; detail: string | null };

async function platformKey(): Promise<string | null> {
  const encrypted = await activeSecret(PLATFORM_INTEGRATION_KEY);
  if (encrypted === null || encrypted === '') return null;

  try {
    const key = (JSON.parse(decryptSecret(encrypted)) as { platformKey?: string }).platformKey ?? '';
    return key === '' ? null : key;
  } catch {
    /** مفتاحٌ لا يُفكّ = غير مضبوط، لا مفتاحٌ خاطئ */
    return null;
  }
}

/**
 * أثمّة مفتاحٌ للبوّابة؟ — **سؤالُ الشاشة قبل أن تَعِد بزرّ**.
 *
 * ولا يُحمَّل المُهايئ لأجله: الشاشة تسأل عن الجاهزية لا عن الاتصال.
 */
export async function providerPlatformReady(): Promise<boolean> {
  return (await platformKey()) !== null;
}

/** مُهايئُ بوّابة المزوّدين — أو `null` حين لا مفتاح. */
export async function resolveProviderPlatform(): Promise<ProviderPlatformPort | null> {
  const key = await platformKey();
  if (key === null) return null;

  const { createMoyasarPlatformAdapter } = await import(
    '@/lib/payments/adapters/moyasar-platform'
  );
  return createMoyasarPlatformAdapter(key);
}

/**
 * يفتح الحساب ويحفظ **كلَّ ما يُعاد مرّةً واحدة**.
 *
 * و`accountSecret` أخطرُها: به **وحده** يُقرأ رصيدُ الشريك (مفتاح
 * المنصّة يُرفض بـ٤٠٣)، ويُعاد في ردّ الإنشاء ولا يُطلب مرّةً أخرى.
 * فمن لم يحفظه لحظتَها لا يقرأ رصيدًا أبدًا.
 */
export async function openProviderAccount(
  admin: AdminUser,
  providerId: string,
  ip: string | null,
  port: ProviderPlatformPort | null = null,
  now: Date = new Date(),
): Promise<OpenResult> {
  const provider = await db.serviceProvider.findUnique({
    where: { id: providerId },
    select: {
      id: true,
      nameAr: true,
      contactEmail: true,
      accountRef: true,
      accountKind: true,
      accountSlug: true,
      accountWebsite: true,
      accountAdminEmail: true,
      accountOwners: true,
      accountSignatory: true,
      accountSignatoryCount: true,
      accountLicence: true,
    },
  });
  if (provider === null) return { ok: false, reason: 'NOT_FOUND', detail: null };
  if (provider.accountRef !== null) return { ok: false, reason: 'ALREADY_OPEN', detail: null };

  if (
    provider.accountKind === null ||
    provider.accountSlug === null ||
    provider.accountOwners === null ||
    provider.accountSignatory === null ||
    provider.accountAdminEmail === null
  ) {
    return { ok: false, reason: 'FILE_INCOMPLETE', detail: null };
  }
  if (provider.contactEmail === null || provider.contactEmail === '') {
    return { ok: false, reason: 'NO_EMAIL', detail: null };
  }

  /**
   * **والمصفوفةُ شرطٌ لا افتراض.** غيابُها يردّ ويشير إلى الشاشة؛
   * وإرسالُ أصفارٍ يفتح حسابًا بشروطٍ لم يقرّرها أحد — وهي شروطُ
   * شريكٍ حقيقيّ لا قيمةٌ تقنية.
   */
  const fees = await providerFeeMatrix();
  if (fees === null) return { ok: false, reason: 'NO_FEES', detail: null };

  const gateway = port ?? (await resolveProviderPlatform());
  if (gateway === null) return { ok: false, reason: 'NOT_CONFIGURED', detail: null };

  const draft: AccountDraft = {
    kind: provider.accountKind,
    slug: provider.accountSlug,
    publicName: provider.nameAr,
    email: provider.contactEmail,
    adminEmail: provider.accountAdminEmail,
    website: provider.accountWebsite ?? '',
    ownersCount: provider.accountOwners,
    signatory: provider.accountSignatory,
    signatoryCount: provider.accountSignatoryCount,
    licenceRequired: provider.accountLicence,
    fees,
  };

  const result = await gateway.openAccount(draft);
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : 'UPSTREAM',
      detail: result.message,
    };
  }

  const state = result.value;
  await db.serviceProvider.update({
    where: { id: providerId },
    data: {
      accountRef: state.accountRef,
      payoutRef: state.payoutRef,
      accountStatus: state.status,
      accountNote: state.note,
      accountSyncAt: now,
      accountDocsComplete: state.documentsComplete,
      ...(state.secretKey === null ? {} : { accountSecret: encryptSecret(state.secretKey) }),
      /** لقطةُ الشروط المُرسلة — ومصفوفةُ اليوم تتغيّر، وهذه لا. */
      accountFees: { ...fees },
    },
  });

  /**
   * **ولا يُكتب السرّ في السجلّ.** سجلّ التدقيق يُقرأ أوسعَ من قاعدة
   * البيانات، فما يُحفظ مُعمّى لا يُنسخ إليه نصًّا.
   */
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'ServiceProvider',
      entityId: providerId,
      action: 'provider.account_opened',
      after: {
        accountRef: state.accountRef,
        payoutRef: state.payoutRef,
        status: state.status,
        fees: { ...fees },
        requiredDocuments: state.requiredDocuments.map((document) => document.type),
      },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, state };
}

export type SyncResult =
  | { ok: true; state: AccountState }
  | { ok: false; reason: 'NOT_FOUND' | 'NO_ACCOUNT' | 'NOT_CONFIGURED' | 'UPSTREAM'; detail: string | null };

/**
 * يقرأ حالَ الحساب **من البوّابة** ويكتبها عندنا.
 *
 * فحالُنا مرآة: الشريك يرفع مستنداته في لوحة البوّابة لا عندنا، فما لم
 * تُقرأ حالُه بقيت صفحتُه تقول «ينتظر مستندًا» بعد أن فعل.
 */
export async function syncProviderAccount(
  admin: AdminUser,
  providerId: string,
  ip: string | null,
  port: ProviderPlatformPort | null = null,
  now: Date = new Date(),
): Promise<SyncResult> {
  const provider = await db.serviceProvider.findUnique({
    where: { id: providerId },
    select: { id: true, accountRef: true, accountStatus: true },
  });
  if (provider === null) return { ok: false, reason: 'NOT_FOUND', detail: null };
  if (provider.accountRef === null) return { ok: false, reason: 'NO_ACCOUNT', detail: null };

  const gateway = port ?? (await resolveProviderPlatform());
  if (gateway === null) return { ok: false, reason: 'NOT_CONFIGURED', detail: null };

  const result = await gateway.accountState(provider.accountRef);
  if (!result.ok) return { ok: false, reason: 'UPSTREAM', detail: result.message };

  const state = result.value;
  await db.serviceProvider.update({
    where: { id: providerId },
    data: {
      payoutRef: state.payoutRef,
      accountStatus: state.status,
      accountNote: state.note,
      accountDocsComplete: state.documentsComplete,
      accountSyncAt: now,
    },
  });

  /** **والتغيُّر وحده يُسجَّل**: مزامنةٌ لا تغيّر شيئًا سطرٌ في سجلٍّ يُقرأ. */
  if (state.status !== provider.accountStatus) {
    await db.auditLog.create({
      data: {
        actorId: admin.id,
        actorType: 'admin',
        entity: 'ServiceProvider',
        entityId: providerId,
        action: 'provider.account_synced',
        before: { status: provider.accountStatus },
        after: { status: state.status, note: state.note },
        ip,
        createdAt: now,
      },
    });
  }

  return { ok: true, state };
}

/**
 * يُقدّم الحساب للمراجعة — **وبعد اكتمال مستنداته وحده**.
 *
 * والبوّابة هي من تقول إنها اكتملت (`documentsComplete`)، فالشرط
 * يُقرأ منها لا يُفترض: تقديمٌ ناقص يُرفض، والمشغّل يقرأ الرفض على
 * أنه عطل.
 */
export async function submitProviderAccount(
  admin: AdminUser,
  providerId: string,
  ip: string | null,
  port: ProviderPlatformPort | null = null,
  now: Date = new Date(),
): Promise<SyncResult> {
  const provider = await db.serviceProvider.findUnique({
    where: { id: providerId },
    select: { id: true, accountRef: true, accountStatus: true },
  });
  if (provider === null) return { ok: false, reason: 'NOT_FOUND', detail: null };
  if (provider.accountRef === null) return { ok: false, reason: 'NO_ACCOUNT', detail: null };

  const gateway = port ?? (await resolveProviderPlatform());
  if (gateway === null) return { ok: false, reason: 'NOT_CONFIGURED', detail: null };

  const result = await gateway.submitForReview(provider.accountRef);
  if (!result.ok) return { ok: false, reason: 'UPSTREAM', detail: result.message };

  const state = result.value;
  await db.serviceProvider.update({
    where: { id: providerId },
    data: {
      accountStatus: state.status,
      accountNote: state.note,
      accountDocsComplete: state.documentsComplete,
      accountSyncAt: now,
      payoutRef: state.payoutRef,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'ServiceProvider',
      entityId: providerId,
      action: 'provider.account_submitted',
      before: { status: provider.accountStatus },
      after: { status: state.status },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, state };
}

/**
 * رصيدُ الشريك لدى البوّابة — **بمفتاحه هو**.
 *
 * ولا يُحسب عندنا: المال يصل إليه مباشرةً، فرقمٌ نحسبه رقمٌ نظنّه.
 * ومن لم نحفظ مفتاحه لا رصيدَ له يُقرأ — سطرٌ لا خطأ.
 */
export async function providerBalance(
  providerId: string,
  port: ProviderPlatformPort | null = null,
): Promise<{ ok: true; total: string; available: string; currency: string } | { ok: false; reason: string }> {
  const provider = await db.serviceProvider.findUnique({
    where: { id: providerId },
    select: { accountSecret: true },
  });
  if (provider === null) return { ok: false, reason: 'NOT_FOUND' };

  let key: string | null = null;
  if (provider.accountSecret !== null && provider.accountSecret !== '') {
    try {
      key = decryptSecret(provider.accountSecret);
    } catch {
      key = null;
    }
  }
  if (key === null) return { ok: false, reason: 'NO_KEY' };

  const gateway = port ?? (await resolveProviderPlatform());
  if (gateway === null) return { ok: false, reason: 'NOT_CONFIGURED' };

  const result = await gateway.balance(key);
  if (!result.ok) return { ok: false, reason: result.reason };
  return {
    ok: true,
    total: result.value.total,
    available: result.value.available,
    currency: result.value.currency,
  };
}
