import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { DealerShell } from '@/components/dealer/DealerShell';
import { listSellableBrandOptions } from '@/lib/domain/catalog-options';
import { cityNames } from '@/lib/domain/cities';
import { db } from '@/lib/db';
import { AddVehicleForm } from './AddVehicleForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'أضف مركبة', robots: { index: false, follow: false } };

/**
 * ═══ `D2b` — بابُ المخزون ═══
 *
 * طلبُ المالك ٢٠٢٦-١١-٢٦: «المعرض يجب ان يضيف السيارة لمخزونه و ضمن
 * خيارات السياره يمكن نشرها». وقِيس قبلها: المنادي الوحيد لمسار النشر
 * معالجُ البيع الشخصيّ، وجدولُ المخزون بلا زرّ إضافة — **فالمعرضُ لا
 * يُدخل سيارةً ولا يعرضها من لوحته**.
 */
export default async function AddVehiclePage() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');

  const [brands, cities, branches, myBranch] = await Promise.all([
    listSellableBrandOptions(),
    cityNames(),
    /** فروعُه وحده — ومعرّفٌ من معرضٍ آخر يُسند مخزونًا لجيرانه. */
    db.branch.findMany({
      where: { dealerId: actor.dealerId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, city: true },
    }),
    actor.branchId === null
      ? null
      : db.branch.findFirst({
          where: { id: actor.branchId, dealerId: actor.dealerId },
          select: { id: true, name: true },
        }),
  ]);

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/inventory"
      title="أضف مركبة إلى المخزون"
      subtitle="تدخل مخزونك الآن — وتنشرها للسوق من خياراتها متى شئت"
    >
      {/*
        **وما يعبر إلى المكوّن يُسلسَل** — ولو لم يُرسم. صفُّ Prisma يحمل
        ما لم يُطلَب، وحمولةُ RSC تسلسله كلَّه في مصدر الصفحة.
      */}
      <AddVehicleForm
        brands={brands}
        cities={cities}
        branches={branches.map((row) => ({ id: row.id, name: row.name, city: row.city }))}
        fixedBranch={myBranch === null ? null : { id: myBranch.id, name: myBranch.name }}
      />
    </DealerShell>
  );
}
