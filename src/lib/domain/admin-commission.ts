import { Prisma } from '@/generated/prisma/client';
import type { CommissionSide } from '@/generated/prisma/enums';
import { db } from '@/lib/db';

/**
 * ═══ العمولة — طرفان مستقلّان يديرهما المشغّل ═══
 *
 * كانت قاعدةً واحدة **تُضاف إلى إجمالي المشتري وتُخصم من صافي البائع
 * معًا**: عمولةٌ معلنة ٢٬٥٠٠ تأخذ ٥٬٠٠٠، ولا حقل يقول أيّهما قُصد.
 *
 * والقرار: لكل طرف تفعيلُه ونسبتُه ومبلغُه الثابت وحدّاه — فتُطبَّق
 * على البائع وحده، أو المشتري وحده، أو كليهما بنسبتين مختلفتين، أو
 * لا أحد.
 *
 * ═══ والقاعدة تُضاف ولا تُعدَّل ═══
 *
 * الطلب يخزّن عمولته وقت إنشائه، فتعديل صفٍّ قائم **لا يغيّر طلبًا
 * قائمًا** — لكنه يمحو ما كانت النسبة عليه يوم أُنشئ ذلك الطلب. وسؤال
 * «بأيّ نسبةٍ حُسبت هذه الفاتورة؟» لا جواب له إلا سجلٌّ يحفظ ما كان.
 *
 * فكل تغيير صفٌّ جديد بـ`activeFrom = now`، والتعطيل صفٌّ بـ
 * `enabled: false` — والقراءة تأخذ الأحدث لكل طرف.
 */

export type CommissionRuleRow = {
  side: CommissionSide;
  enabled: boolean;
  pct: string;
  fixedFee: string;
  minFee: string | null;
  maxFee: string | null;
  activeFrom: string;
  /** كم صفًّا سبقه — فيُعرف أنّ للقاعدة تاريخًا يُراجَع */
  revisions: number;
};

const SIDES: readonly CommissionSide[] = ['SELLER', 'BUYER'];

const str = (value: Prisma.Decimal): string => value.toFixed(2);

/** القاعدة السارية لكل طرف — والغائبة تُعرض صفرًا معطَّلًا لا تُخفى. */
export async function listCommissionRules(now: Date = new Date()): Promise<CommissionRuleRow[]> {
  const rules = await db.commissionRule.findMany({
    where: { scope: 'global', activeFrom: { lte: now } },
    orderBy: { activeFrom: 'desc' },
  });

  return SIDES.map((side) => {
    const forSide = rules.filter((rule) => rule.side === side);
    const current = forSide[0];

    if (current === undefined) {
      return {
        side,
        enabled: false,
        pct: '0.00',
        fixedFee: '0.00',
        minFee: null,
        maxFee: null,
        activeFrom: now.toISOString(),
        revisions: 0,
      };
    }

    return {
      side,
      enabled: current.enabled,
      pct: str(current.pct),
      fixedFee: str(current.fixedFee),
      minFee: current.minFee === null ? null : str(current.minFee),
      maxFee: current.maxFee === null ? null : str(current.maxFee),
      activeFrom: current.activeFrom.toISOString(),
      revisions: forSide.length - 1,
    };
  });
}

export type CommissionInput = {
  side: CommissionSide;
  enabled: boolean;
  pct: number;
  fixedFee: number;
  minFee: number | null;
  maxFee: number | null;
};

export type CommissionFailure =
  | 'PCT_OUT_OF_RANGE'
  | 'NEGATIVE_AMOUNT'
  | 'MIN_ABOVE_MAX'
  | 'NO_CHARGE_ENABLED';

export type CommissionSaveResult =
  | { ok: true; side: CommissionSide }
  | { ok: false; reason: CommissionFailure };

/**
 * الحدّ الأعلى للنسبة — **خمسون بالمئة**.
 *
 * وليس رقمًا اعتباطيًّا: عمولةٌ تتجاوز نصف الثمن ليست عمولة. وبلا حدٍّ
 * يصير حقلُ نسبةٍ فيه صفرٌ زائد سببًا في فاتورةٍ تبتلع الصفقة، والخطأ
 * المطبعيّ لا يُكتشف إلا بعد أن يراه بائع.
 */
export const MAX_COMMISSION_PCT = 50;

export async function setCommissionRule(
  input: CommissionInput & { adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<CommissionSaveResult> {
  if (input.pct < 0 || input.pct > MAX_COMMISSION_PCT) {
    return { ok: false, reason: 'PCT_OUT_OF_RANGE' };
  }
  if (input.fixedFee < 0 || (input.minFee ?? 0) < 0 || (input.maxFee ?? 0) < 0) {
    return { ok: false, reason: 'NEGATIVE_AMOUNT' };
  }
  if (input.minFee !== null && input.maxFee !== null && input.minFee > input.maxFee) {
    return { ok: false, reason: 'MIN_ABOVE_MAX' };
  }

  /**
   * **مفعَّلةٌ بصفرٍ في كل حقولها لا تُقبل.**
   *
   * لأنها تقول «نأخذ عمولة» وتأخذ صفرًا — فيقرأ المشغّل الشاشة على
   * أنه فعّلها وهو لم يفعّل شيئًا. والتعطيل الصريح يقول الحقيقة.
   */
  if (input.enabled && input.pct === 0 && input.fixedFee === 0) {
    return { ok: false, reason: 'NO_CHARGE_ENABLED' };
  }

  const before = await db.commissionRule.findFirst({
    where: { scope: 'global', side: input.side },
    orderBy: { activeFrom: 'desc' },
  });

  // صفٌّ جديد لا تعديل — فيبقى ما كانت عليه يوم حُسبت به فاتورة
  await db.commissionRule.create({
    data: {
      scope: 'global',
      side: input.side,
      enabled: input.enabled,
      pct: new Prisma.Decimal(input.pct),
      fixedFee: new Prisma.Decimal(input.fixedFee),
      minFee: input.minFee === null ? null : new Prisma.Decimal(input.minFee),
      maxFee: input.maxFee === null ? null : new Prisma.Decimal(input.maxFee),
      activeFrom: now,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'CommissionRule',
      entityId: input.side,
      action: 'commission.changed',
      before:
        before === null
          ? {}
          : {
              enabled: before.enabled,
              pct: str(before.pct),
              fixedFee: str(before.fixedFee),
            },
      after: {
        enabled: input.enabled,
        pct: input.pct.toFixed(2),
        fixedFee: input.fixedFee.toFixed(2),
      },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, side: input.side };
}
