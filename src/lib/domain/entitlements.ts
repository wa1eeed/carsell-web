import type { ListingType } from '@/generated/prisma/client';
import { db } from '@/lib/db';

/**
 * محرّك الخصائص (HANDOFF §١٤).
 *
 * **القاعدة الذهبية:** الكود يسأل `entitlement("can_auction")` — لا يسأل
 * «هل هو تاجر؟» ولا «ما اسم باقته؟». أي استثناء واحد يهدم النظام لاحقًا.
 *
 * ترتيب القراءة، والأخير يفوز:
 *   ١. القيمة الافتراضية من `Entitlement`
 *   ٢. قيمة الباقة من `PlanEntitlement` عبر الاشتراك النشط
 *   ٣. تجاوز المستخدم من `EntitlementOverride` غير المنتهي
 */

export type EntitlementValue = boolean | number | string;
export type Entitlements = Record<string, EntitlementValue>;

function parse(type: string, raw: string): EntitlementValue {
  if (type === 'bool') return raw === 'true';
  if (type === 'int' || type === 'percent') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return raw;
}

export async function resolveEntitlements(
  userId: string,
  now: Date = new Date(),
): Promise<Entitlements> {
  const [definitions, subscription, overrides] = await Promise.all([
    db.entitlement.findMany(),
    db.subscription.findFirst({
      where: {
        userId,
        status: 'active',
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      orderBy: { startsAt: 'desc' },
      include: { plan: { include: { entitlements: true } } },
    }),
    db.entitlementOverride.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
    }),
  ]);

  const types = new Map(definitions.map((d) => [d.key, d.type]));
  const result: Entitlements = {};

  for (const definition of definitions) {
    result[definition.key] = parse(definition.type, definition.defaultValue);
  }

  for (const row of subscription?.plan.entitlements ?? []) {
    const type = types.get(row.entitlementKey);
    if (type !== undefined) result[row.entitlementKey] = parse(type, row.value);
  }

  for (const row of overrides) {
    const type = types.get(row.entitlementKey);
    if (type !== undefined) result[row.entitlementKey] = parse(type, row.value);
  }

  return result;
}

/**
 * ═══ ومن يقرأ هذه الخصائص؟ ═══
 *
 * قِيس ٢٠٢٦-١٠-١٧: **لا أحد**. عشرُ خصائص معرَّفة، وطبقاتُ باقةٍ
 * وتجاوزٍ تُحلّ ترتيبًا صحيحًا، وشاشةُ أدمن تضبطها — ولا سطرَ في
 * المنتج يسأل عن واحدةٍ منها. فمشغّلٌ يمنح باقةً بحدّ خمسة إعلانات
 * **يُقال له إنه فعل** ولا يقع شيء.
 *
 * والمواصفة (HANDOFF §١٤) تَعِد: «تُبنى من اليوم الأول وهي فارغة …
 * التوسّع لاحقًا يصير **إدخال بيانات لا كتابة كود**». وهذا الوعد لم
 * يكن صحيحًا: إدخالُ البيانات كان يحتاج كودًا لم يُكتب.
 *
 * **والافتراضيّات تُبقي اليوم كما هو**: الثلاثة `true` والحدّ `-1`،
 * فلا يتغيّر سلوكٌ بهذا الوصل — يصير الوعدُ صحيحًا وحده.
 */
export const LISTING_TYPE_ENTITLEMENT: Record<ListingType, string> = {
  DIRECT: 'can_direct_sale',
  NEGOTIATION: 'can_negotiate',
  AUCTION: 'can_auction',
};

export type SellingAllowance = {
  /** طرقُ البيع المسموحة — والمفتاح يُسأل عنه لا الدور ولا اسم الباقة. */
  types: Record<ListingType, boolean>;
  /** `-1` بلا حدّ، وهو الافتراضيّ. */
  maxActiveListings: number;
};

function bool(value: EntitlementValue | undefined): boolean {
  /** **والغائب مسموح** — خاصّيةٌ لم تُعرَّف لا تمنع أحدًا. */
  return value === undefined ? true : value === true;
}

export async function sellingAllowance(
  userId: string,
  now: Date = new Date(),
): Promise<SellingAllowance> {
  const entitlements = await resolveEntitlements(userId, now);
  const limit = entitlements['max_active_listings'];

  return {
    types: {
      DIRECT: bool(entitlements[LISTING_TYPE_ENTITLEMENT.DIRECT]),
      NEGOTIATION: bool(entitlements[LISTING_TYPE_ENTITLEMENT.NEGOTIATION]),
      AUCTION: bool(entitlements[LISTING_TYPE_ENTITLEMENT.AUCTION]),
    },
    maxActiveListings: typeof limit === 'number' ? limit : -1,
  };
}

/**
 * الحالاتُ التي تشغل مقعدًا من الحدّ.
 *
 * // DESIGN-Q: `PAUSED` محسوبة — إعلانٌ يوقفه صاحبُه يعود بضغطة، فلو
 * لم يُحسب لصار الحدُّ بلا معنًى (يوقف خمسةً وينشر خمسة). والمسودّة
 * والمباعة والمنتهية والموقوفة إداريًّا لا تُحسب.
 */
export const SEAT_TAKING_STATUSES = ['PENDING_REVIEW', 'PUBLISHED', 'RESERVED', 'PAUSED'] as const;
