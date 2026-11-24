import { redirect } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Badge } from '@/components/ui/Badge';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { currentUserFromCookies } from '@/lib/domain/account';
import { pendingAcceptance, requiredDocuments } from '@/lib/domain/legal';
import { db } from '@/lib/db';
import { AR_DATE_LOCALE, displayDigits } from '@/lib/arabic';
import { AcceptPanel } from './AcceptPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الشروط والموافقات' };

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});

/**
 * ═══ موافقاتُ الحساب — **والبابُ الذي يُستوفى منه الشرط** ═══
 *
 * شاشةُ الدخول تشترط القبول، و`LegalAcceptance` تسجّله، وبطاقةُ A34
 * تعدّ من قبِل. **وكان ذلك شرطًا بلا بابٍ لاستيفائه**: من دخل قبل أن
 * يوجد السجلّ لا سبيل له أن يُثبت قبولًا، ونسخةٌ جوهريّةٌ تنفذ تطلب
 * قبولًا جديدًا لا موضعَ له.
 *
 * فهذه الشاشة هي الموضع: تعرض ما يُنتظَر قبولُه بنصّه وتاريخ سريانه،
 * وتعرض ما قُبل بتاريخه — **فمن قبِل يرى متى ومِمّ**.
 */
export default async function AccountLegalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  const [required, pending, held] = await Promise.all([
    requiredDocuments(),
    pendingAcceptance(user.id),
    db.legalAcceptance.findMany({
      where: { userId: user.id },
      orderBy: { acceptedAt: 'desc' },
      select: { documentKey: true, version: true, acceptedAt: true, context: true },
    }),
  ]);

  const waiting = new Set(pending.map((doc) => doc.key));
  const titles = new Map(required.map((doc) => [doc.key, doc.titleAr] as const));

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">
          <nav className="mb-4 text-2xs opacity-70">
            <Link href="/account" className="hover:underline">
              حسابي
            </Link>
            <span aria-hidden> · </span>
            <span>الشروط والموافقات</span>
          </nav>

          <h1 className="mb-2.5 text-4xl font-bold tracking-tight">الشروط والموافقات</h1>
          <p className="mb-7 max-w-2xl text-sm leading-loose opacity-68">
            ما قبلته ومتى، وبأي نسخة. <b>والقبول يثبت بالنسخة لا بالمستند</b>، فما
            قبلته يبقى محفوظا بنصه حتى لو عدل المستند بعده.
          </p>

          {pending.length === 0 ? (
            <div className="mb-7 rounded-xl border border-line bg-surface p-5">
              <p className="text-2xs font-bold">لا شيء ينتظر موافقتك</p>
              <p className="mt-1 text-3xs leading-loose opacity-70">
                {/*
                  **والجارُّ لا يُتبَع بـ`<Quantity>`**: «من مستندان»
                  خطأ. فالجملة تُصاغ والمعدودُ فيها مذكورٌ باسمه،
                  والرقمُ بين قوسين آخرها.
                */}
                قبلت النسخ السارية من المستندات الإلزامية (
                <ArabicNumber value={required.length} />)
              </p>
            </div>
          ) : (
            <AcceptPanel
              locale={locale}
              pending={pending.map((doc) => ({
                key: doc.key,
                titleAr: doc.titleAr,
                version: doc.version,
              }))}
            />
          )}

          <h2 className="mb-3 mt-8 text-3xs font-bold tracking-[0.14em] opacity-65">
            المستندات الإلزامية
          </h2>
          <ul className="mb-8 flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
            {required.map((doc) => (
              <li key={doc.key} className="flex flex-wrap items-center gap-3 p-4.5">
                <Link
                  href={`/legal/${doc.key}`}
                  className="min-w-40 flex-1 text-2xs font-bold hover:underline"
                >
                  {doc.titleAr}
                </Link>
                <span className="font-num text-3xs opacity-70">{displayDigits(doc.version)}</span>
                {waiting.has(doc.key) ? (
                  <Badge tone="warn">ينتظر موافقتك</Badge>
                ) : (
                  <Badge tone="accent">مقبول</Badge>
                )}
              </li>
            ))}
          </ul>

          {held.length === 0 ? null : (
            <>
              <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-65">سجل موافقاتك</h2>
              <ul className="mb-10 flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
                {held.map((row) => (
                  <li
                    key={`${row.documentKey}@${row.version}`}
                    className="flex flex-wrap items-center gap-3 p-4.5"
                  >
                    <span className="min-w-40 flex-1 text-2xs">
                      {titles.get(row.documentKey) ?? row.documentKey}
                    </span>
                    <span className="font-num text-3xs opacity-70">
                      {displayDigits(row.version)}
                    </span>
                    <span className="text-3xs opacity-70">
                      {riyadh.format(new Date(row.acceptedAt))}
                    </span>
                    <span className="text-3xs opacity-65">
                      {row.context === 'signup' ? 'عند التسجيل' : 'بعد تعديل'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </main>
    </>
  );
}
