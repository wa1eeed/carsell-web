import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { DealerShell } from '@/components/dealer/DealerShell';
import { Money } from '@/components/ui/Money';
import { currentMonth, dealerExpenses } from '@/lib/domain/dealer-expenses';
import { DEALER_EXPENSE_KIND_AR } from '@/lib/labels/dealer';
import { db } from '@/lib/db';
import { ExpenseForm } from './ExpenseForm';
import { ExpenseList } from './ExpenseList';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'مصروفات المعرض', robots: { index: false, follow: false } };

/**
 * ═══ `D13` — مصروفُ المعرض ═══
 *
 * «تابع مصروفات المعرض اليومية والشهرية» يبيعه منافسٌ باسمه، وآخرُ
 * يربط المصروفَ بالسيارة وحدها — **فالإيجارُ والرواتب بلا موضع**.
 * وعندنا `VehicleCost` لما يلتصق بسيارة، ولا شيء لما لا يلتصق بواحدة.
 *
 * **والحدُّ الفاصل يُقال في الشاشة لا في التوثيق وحده**: من يسجّل نقلَ
 * سيارةٍ هنا يُخرجه من هامشها، ومن يسجّل الإيجارَ هناك يُفسد هامشَ
 * سيارةٍ بريئة.
 */
export default async function DealerExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  /** **والبائعُ لا يرى دفترَ المصروف** — كما لا يرى كلفةَ الشراء. */
  if (actor.role === 'SALES') redirect('/dealer');

  const { month } = await searchParams;
  const now = new Date();
  const picked = month ?? currentMonth(now);

  const [{ rows, summary }, branches, myBranch] = await Promise.all([
    dealerExpenses(actor.dealerId, actor.branchId, picked, now),
    db.branch.findMany({
      where: { dealerId: actor.dealerId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    actor.branchId === null
      ? null
      : db.branch.findFirst({
          where: { id: actor.branchId, dealerId: actor.dealerId },
          select: { id: true, name: true },
        }),
  ]);

  /** واليومُ بتوقيت الرياض — يُحسب هنا لا في المتصفّح. */
  const today = new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/expenses"
      title="مصروفات المعرض"
      subtitle={`شهر ${picked} — وما لا ينسب إلى سيارة`}
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card title="مصروف الشهر">
          {summary.monthEntered ? (
            <p className="text-2xl font-bold">
              <Money amount={summary.monthTotal} />
            </p>
          ) : (
            /*
              **ورقمٌ لم يُدخَل ليس صفرًا.** شهرٌ لم تُدخَل أرقامُه يقول
              ذلك — والفرقُ بين «لا ننفق شيئًا» و«لم يُدخل أحدٌ شيئًا»
              هو الفرقُ كلُّه، وأحدُهما إنذار.
            */
            <p className="text-2xs leading-loose opacity-70">لم يدخل مصروف هذا الشهر بعد.</p>
          )}
        </Card>

        <Card title="مصروف اليوم">
          {/*
            **وصفرُ اليوم صفران.** شهرٌ لم يُدخَل فيه شيءٌ أصلًا لا
            يُقال عنه «٠ اليوم» — ذاك لم يُقَس. وشهرٌ فيه إدخالاتٌ ولا
            شيءَ اليوم صفرٌ **مقيس**، فيُقال نفيًا: «لا مصروف اليوم».
          */}
          {!summary.monthEntered ? (
            <p className="text-2xs leading-loose opacity-70">لم يدخل مصروف هذا الشهر بعد.</p>
          ) : Number(summary.todayTotal) === 0 ? (
            <p className="text-2xs leading-loose opacity-70">لا مصروف اليوم.</p>
          ) : (
            <p className="text-2xl font-bold">
              <Money amount={summary.todayTotal} />
            </p>
          )}
        </Card>

        {/*
          **والأكبرُ هو ما يُقرأ**: قائمةٌ بسبعة أصناف تُقرأ في آخر
          الشهر، وأكبرُ صنفين يُقرآن الآن.
        */}
        <Card title="أكبر الأصناف">
          {summary.byKind.length === 0 ? (
            <p className="text-2xs opacity-70">—</p>
          ) : (
            summary.byKind.slice(0, 3).map((line) => (
              <p key={line.kind} className="flex items-baseline justify-between gap-3 text-2xs">
                <span className="opacity-70">{DEALER_EXPENSE_KIND_AR[line.kind]}</span>
                <Money amount={line.amount} />
              </p>
            ))
          )}
        </Card>
      </div>

      <ExpenseForm
        branches={branches.map((row) => ({ id: row.id, name: row.name }))}
        fixedBranch={myBranch === null ? null : { id: myBranch.id, name: myBranch.name }}
        today={today}
      />

      <ExpenseList rows={rows} />
    </DealerShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-65">{title}</h2>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}
