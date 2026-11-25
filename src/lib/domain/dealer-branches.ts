import { db } from '@/lib/db';

/**
 * ═══ فروعُ المعرض — `D9` ═══
 *
 * «الملقا · الرياض · ١٨ مركبة · خالد م.».
 *
 * **والفرعُ يُعطَّل ولا يُحذف.** مركباتٌ بيعت منه وطلباتٌ تمّت فيه
 * وتقاريرُ تُقرأ بعد سنة — وحذفُ صفّه يجعل تاريخَها بلا مكان. وفرعٌ
 * معطَّل لا يُسنَد إليه جديد ويبقى في التقارير.
 */
export type BranchFailure = 'NAME_REQUIRED' | 'CITY_REQUIRED' | 'NOT_FOUND' | 'HAS_VEHICLES';

export type BranchRow = {
  id: string;
  name: string;
  city: string;
  managerName: string | null;
  vehicleCount: number;
  memberCount: number;
  active: boolean;
};

export async function dealerBranches(dealerId: string): Promise<BranchRow[]> {
  const rows = await db.branch.findMany({
    where: { dealerId },
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true, name: true, city: true, active: true,
      manager: { select: { name: true } },
      _count: { select: { vehicles: true, members: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    city: row.city,
    managerName: row.manager?.name ?? null,
    vehicleCount: row._count.vehicles,
    memberCount: row._count.members,
    active: row.active,
  }));
}

export async function createBranch(
  input: { dealerId: string; name: string; city: string; address?: string | null; phone?: string | null },
  now: Date = new Date(),
): Promise<{ ok: true; id: string } | { ok: false; reason: BranchFailure }> {
  const name = input.name.trim();
  const city = input.city.trim();
  if (name === '') return { ok: false, reason: 'NAME_REQUIRED' };
  if (city === '') return { ok: false, reason: 'CITY_REQUIRED' };

  const row = await db.branch.create({
    data: {
      dealerId: input.dealerId,
      name,
      city,
      address: input.address?.trim() === '' ? null : (input.address ?? null),
      phone: input.phone?.trim() === '' ? null : (input.phone ?? null),
      createdAt: now,
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

/**
 * يعطّل فرعًا أو يعيده.
 *
 * **ولا يُعطَّل فرعٌ فيه مركبات**: مركبةٌ في فرعٍ معطَّل تختفي من كل
 * مرشِّح فرعٍ ولا تظهر في غيره — فتصير رأسَ مالٍ لا يراه أحد. تُنقل
 * أوّلًا، ثمّ يُعطَّل.
 */
export async function setBranchActive(
  input: { dealerId: string; branchId: string; active: boolean },
): Promise<{ ok: true } | { ok: false; reason: BranchFailure }> {
  const branch = await db.branch.findFirst({
    where: { id: input.branchId, dealerId: input.dealerId },
    select: { id: true, _count: { select: { vehicles: true } } },
  });
  if (branch === null) return { ok: false, reason: 'NOT_FOUND' };
  if (!input.active && branch._count.vehicles > 0) {
    return { ok: false, reason: 'HAS_VEHICLES' };
  }
  await db.branch.update({ where: { id: branch.id }, data: { active: input.active } });
  return { ok: true };
}
