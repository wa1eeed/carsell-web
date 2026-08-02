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
