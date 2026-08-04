import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { currentDeadlines } from './deadlines';

/**
 * ═══ A32 — إعدادات المزادات ═══
 *
 * **تُنسَخ لقطةً في كل مزاد وقت إنشائه** — عنوان التصميم حرفيًّا.
 * فمزايدٌ بدأ على قاعدة (عربونٌ بخمسة آلاف، وفرقٌ أدنى بخمسمئة) لا
 * تتغيّر عليه القاعدة في منتصف المزاد.
 *
 * والتعديل هنا يسري على **المزادات الجديدة وحدها**، وكل مزادٍ قائم
 * يحمل لقطته في صفّه (`bidIncrement` · `depositAmount`).
 *
 * ═══ وأربعة منها بنصاب عضوين ═══
 *
 * قيمة العربون · مهلة السداد · عقوبة عدم السداد · إخفاء الاحتياطي.
 * لأن كلًّا منها يمسّ مالًا محجوزًا لدى الناس أو سرًّا وعدنا بحفظه —
 * والباقي ضبطٌ تشغيليّ.
 */

export type AuctionSettings = {
  extendBySeconds: number;
  extendWindowSeconds: number;
  maxExtensions: number;
  defaultDeposit: string;
  minIncrement: string;
  winnerPaymentHours: number;
  hideReserve: boolean;
  buyNowBeforeReserve: boolean;
  sellerDecisionHours: number;
  durationsDays: number[];
};

/** الحقول التي تحتاج نصابًا — تُقرأ في الشاشة وفي الحارس معًا. */
export const DUAL_APPROVAL_FIELDS = [
  'defaultDeposit',
  'winnerPaymentHours',
  'hideReserve',
] as const;

export async function auctionSettings(): Promise<AuctionSettings> {
  const [platform, deadlines] = await Promise.all([
    db.platformSetting.findUnique({ where: { id: 'default' } }),
    currentDeadlines(),
  ]);

  return {
    extendBySeconds: deadlines.auctionExtendBySeconds,
    extendWindowSeconds: deadlines.auctionExtendWindowSeconds,
    maxExtensions: platform?.auctionMaxExtensions ?? 6,
    defaultDeposit: (platform?.auctionDefaultDeposit ?? new Prisma.Decimal(5000)).toFixed(2),
    minIncrement: (platform?.auctionMinIncrement ?? new Prisma.Decimal(500)).toFixed(2),
    winnerPaymentHours: platform?.auctionWinnerPaymentHours ?? 48,
    hideReserve: platform?.auctionHideReserve ?? true,
    buyNowBeforeReserve: platform?.auctionBuyNowBeforeReserve ?? true,
    sellerDecisionHours: deadlines.sellerDecisionHours,
    durationsDays: platform?.auctionDurationsDays ?? [1, 3, 7],
  };
}

export type SettingsFailure = 'OUT_OF_BOUNDS' | 'NO_DURATIONS';
export type SettingsResult = { ok: true } | { ok: false; reason: SettingsFailure };

export type SettingsInput = {
  maxExtensions: number;
  defaultDeposit: number;
  minIncrement: number;
  winnerPaymentHours: number;
  hideReserve: boolean;
  buyNowBeforeReserve: boolean;
  durationsDays: number[];
};

/**
 * حفظ الافتراضيّات.
 *
 * **والحدود تُفحص في الخادم**: فرقٌ أدنى بصفر يجعل المزايدة بريال
 * فوق سابقتها ألف مرّة، وعربونٌ بصفر يُلغي جدّية المزايد — وكلاهما
 * يُدخل الشاشة رقمًا يبدو بريئًا.
 */
export async function saveAuctionSettings(
  input: SettingsInput & { adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<SettingsResult> {
  if (
    input.maxExtensions < 0 || input.maxExtensions > 50 ||
    input.defaultDeposit < 0 || input.defaultDeposit > 1_000_000 ||
    input.minIncrement <= 0 || input.minIncrement > 100_000 ||
    input.winnerPaymentHours < 1 || input.winnerPaymentHours > 720
  ) {
    return { ok: false, reason: 'OUT_OF_BOUNDS' };
  }

  const durations = [...new Set(input.durationsDays.filter((d) => d >= 1 && d <= 30))].sort(
    (a, b) => a - b,
  );
  // بلا مدّةٍ واحدة لا يستطيع بائعٌ إنشاء مزاد أصلًا
  if (durations.length === 0) return { ok: false, reason: 'NO_DURATIONS' };

  const before = await db.platformSetting.findUnique({ where: { id: 'default' } });

  await db.platformSetting.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      auctionMaxExtensions: input.maxExtensions,
      auctionDefaultDeposit: new Prisma.Decimal(input.defaultDeposit),
      auctionMinIncrement: new Prisma.Decimal(input.minIncrement),
      auctionWinnerPaymentHours: input.winnerPaymentHours,
      auctionHideReserve: input.hideReserve,
      auctionBuyNowBeforeReserve: input.buyNowBeforeReserve,
      auctionDurationsDays: durations,
    },
    update: {
      auctionMaxExtensions: input.maxExtensions,
      auctionDefaultDeposit: new Prisma.Decimal(input.defaultDeposit),
      auctionMinIncrement: new Prisma.Decimal(input.minIncrement),
      auctionWinnerPaymentHours: input.winnerPaymentHours,
      auctionHideReserve: input.hideReserve,
      auctionBuyNowBeforeReserve: input.buyNowBeforeReserve,
      auctionDurationsDays: durations,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'PlatformSetting',
      entityId: 'auction',
      action: 'auction.settings_changed',
      before: {
        deposit: (before?.auctionDefaultDeposit ?? new Prisma.Decimal(0)).toFixed(2),
        paymentHours: before?.auctionWinnerPaymentHours ?? 0,
        hideReserve: before?.auctionHideReserve ?? true,
      },
      after: {
        deposit: input.defaultDeposit.toFixed(2),
        paymentHours: input.winnerPaymentHours,
        hideReserve: input.hideReserve,
      },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true };
}
