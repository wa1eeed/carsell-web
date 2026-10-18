import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import { SiteHeader } from '@/components/site/SiteHeader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { routing } from '@/i18n/routing';
import { PDPL_EFFECTIVE, PDPL_SECTIONS, PDPL_VERSION } from '@/content/pdpl';
import { trustMarks } from '@/lib/domain/trust-marks';

export const dynamic = 'force-dynamic';

type Params = { locale: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return {
    title: 'حماية البيانات الشخصية — PDPL',
    description:
      'كيف تجمع منصة كارز بياناتك الشخصية وتعالجها وتحفظها، وما حقوقك فيها وكيف تمارسها — وفق نظام حماية البيانات الشخصية السعودي.',
    alternates: { canonical: `/${locale}/pdpl` },
  };
}

/**
 * ═══ صفحةُ حماية البيانات الشخصية ═══
 *
 * **ومعيارُها أن تُجيب لا أن تَعِد.** قِيس ما تنشره منصّاتٌ مماثلة
 * فظهر نمطٌ واحد: عباراتٌ عامّة بلا رقم — «نحفظها للمدّة اللازمة»،
 * «نُبلغ خلال المدد النظامية»، «نتّخذ إجراءاتٍ مناسبة». وكلُّها صحيحةٌ
 * ولا يُراجَع عليها أحد.
 *
 * فهذه تُسمّي الأرقام: جدولُ حفظٍ بمدده، ومهلةُ ردٍّ بأيّامها، ومهلةُ
 * إبلاغٍ عن خرقٍ بساعاتها، وأساسٌ نظاميٌّ **لكلّ غرضٍ على حدة** لا
 * قائمةُ أسسٍ مجموعة، وفصلٌ بين «جهة تحكّم» و«جهة معالجة» يعرف به
 * القارئ بابَه.
 *
 * ═══ وفهرسٌ بمراسٍ ثابتة ═══
 *
 * نصٌّ قانونيّ يُقتبَس ويُرسَل، فكلُّ بندٍ رابطٌ — و«راجِع بند الحفظ»
 * تصير وصلةً تُفتح لا موضعًا يُبحث عنه في صفحةٍ طويلة.
 */
export default async function PdplPage({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [nav, marks] = await Promise.all([
    getTranslations('site.nav'),
    trustMarks('REGULATORY'),
  ]);

  const date = new Intl.DateTimeFormat(locale === 'ar' ? AR_DATE_LOCALE : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  /** الجهةُ التي تُرفع إليها الشكوى — من البيانات لا من نصٍّ مكتوب. */
  const authority = marks.find((mark) => mark.key === 'ndgp') ?? null;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-page px-10 py-10">
          <Breadcrumb
            label="مسار التنقل"
            className="mb-6"
            items={[
              { label: nav('home'), href: `/${locale}` },
              { label: 'حماية البيانات الشخصية' },
            ]}
          />

          <header className="mb-9 border-b border-line pb-8">
            <p className="mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-65">
              الامتثال والحوكمة
            </p>
            {/*
              **والاختصارُ بجانب الاسم.** «PDPL» هو ما يُبحث به ويُحال
              إليه في المراسلات النظامية، واسمٌ عربيٌّ وحده يجعل من يعرف
              الاختصار لا يتعرّف على الصفحة.
            */}
            <h1 className="mb-3.5 flex flex-wrap items-baseline gap-3 text-3xl font-bold tracking-tight">
              حماية البيانات الشخصية
              <span dir="ltr" className="bidi-ltr rounded-md border border-line px-2.5 py-1 text-sm font-bold tracking-[0.08em] opacity-70">
                PDPL
              </span>
            </h1>
            {/*
              **ولا يمدح المستندُ نفسَه.** كان هنا سطرٌ يصف الصفحة بأنها
              «بأسسٍ لكلّ غرض ومددِ حفظٍ بالأرقام» — وهي دعايةٌ للوثيقة
              لا حكمٌ فيها. والنصُّ النظاميّ يُقرّر ولا يُطري نفسَه.
            */}
            <p className="max-w-3xl text-sm leading-loose opacity-80">
              تبين هذه الصفحة أسس معالجة البيانات الشخصية في منصة كارز وحقوق
              أصحابها وإجراءات ممارستها، وفقا لنظام حماية البيانات الشخصية ولائحته
              التنفيذية.
            </p>

            <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 text-2xs">
              <div>
                <dt className="mb-1 text-3xs opacity-65">النسخة</dt>
                {/*
                  **ورقمُ النسخة ليس كمّيّة.** مرّرتُه على `ArabicNumber`
                  فقرأته عددًا وأسقط كسرَه — «١٫٠» صارت «١». وهو معرّفٌ
                  يُقارن خانةً بخانة، فيُعزل لاتينيًّا كما هو.
                */}
                <dd dir="ltr" className="font-num bidi-ltr font-bold">
                  {PDPL_VERSION}
                </dd>
              </div>
              <div>
                <dt className="mb-1 text-3xs opacity-65">تاريخ السريان</dt>
                <dd className="font-bold">{date.format(new Date(PDPL_EFFECTIVE))}</dd>
              </div>
              <div>
                <dt className="mb-1 text-3xs opacity-65">المرجع النظامي</dt>
                <dd className="font-bold">
                  نظام حماية البيانات الشخصية ولائحته التنفيذية
                </dd>
              </div>
            </dl>
          </header>

          <div className="flex flex-col gap-10 lg:flex-row-reverse lg:items-start">
            {/*
              ═══ الفهرسُ ملازمٌ على الشاشة الواسعة ═══

              صفحةٌ بخمسةَ عشرَ بندًا تُقرأ بالقفز لا بالتمرير، ومن
              يبحث عن «كم تحفظون بياناتي» لا يجب أن يمرّ على أربعةَ عشرَ
              بندًا ليبلغه.
            */}
            <nav
              aria-label="بنود الصفحة"
              className="shrink-0 lg:sticky lg:top-6 lg:w-64"
            >
              <p className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-65">البنود</p>
              <ol className="-my-1 flex flex-col gap-1.5 text-2xs">
                {PDPL_SECTIONS.map((section, i) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="flex gap-2.5 py-1 opacity-75 hover:opacity-100 hover:underline"
                    >
                      <span className="font-num shrink-0 opacity-65">
                        <ArabicNumber value={i + 1} grouped={false} />
                      </span>
                      <span>{section.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="min-w-0 flex-1">
              {PDPL_SECTIONS.map((section, i) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="mb-9 scroll-mt-6 border-b border-line-2 pb-8 last:border-0"
                >
                  <h2 className="mb-1 flex flex-wrap items-baseline gap-2.5 text-lg font-bold">
                    <span className="font-num text-sm opacity-65">
                      <ArabicNumber value={i + 1} grouped={false} />
                    </span>
                    {section.title}
                  </h2>
                  {/*
                    **والإحالةُ إلى المادّة ترفع الصفحة من وعدٍ إلى سند.**
                    ومرجعُ السوق الذي قِيس لا يُحيل إلى مادّةٍ واحدة.
                  */}
                  {section.article === undefined ? null : (
                    <p className="mb-3.5 text-3xs opacity-65">{section.article}</p>
                  )}

                  <div className="flex flex-col gap-4">
                    {section.blocks.map((block, n) => (
                      <Block key={n} block={block} />
                    ))}
                  </div>
                </section>
              ))}

              {/* ═══ وبابُ الممارسة في آخر الصفحة — حيث ينتهي القارئ ═══ */}
              <section
                id="contact"
                className="scroll-mt-6 rounded-xl border border-line bg-surface p-7"
              >
                <h2 className="mb-3.5 text-lg font-bold">مسؤول حماية البيانات</h2>
                <p className="mb-5 max-w-2xl text-sm leading-loose opacity-80">
                  توجه طلبات ممارسة الحقوق والاستفسارات المتعلقة بمعالجة البيانات
                  الشخصية إلى مسؤول حماية البيانات في المنصة.
                </p>

                <dl className="flex flex-wrap gap-x-12 gap-y-4 text-sm">
                  <div>
                    <dt className="mb-1 text-3xs opacity-65">البريد المخصص</dt>
                    <dd dir="ltr" className="bidi-ltr font-num font-bold">
                      privacy@carz.sa
                    </dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-3xs opacity-65">مدة الإشعار بالاستلام</dt>
                    <dd className="font-bold">ثلاثة أيام عمل</dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-3xs opacity-65">مدة الرد الكامل</dt>
                    <dd className="font-bold">ثلاثون يوما</dd>
                  </div>
                </dl>

                <p className="mt-6 max-w-2xl border-t border-line-2 pt-5 text-2xs leading-loose opacity-75">
                  ولصاحب البيانات تقديم شكوى إلى الجهة المختصة بحماية البيانات في
                  المملكة
                  {authority?.verifyUrl === undefined || authority.verifyUrl === null ? null : (
                    <>
                      {' — '}
                      <a
                        href={authority.verifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="-my-1.5 inline-block py-1.5 font-bold underline underline-offset-2"
                      >
                        {authority.nameAr}
                      </a>
                    </>
                  )}
                  ، دون اشتراط مراجعة المنصة أولا.
                </p>
              </section>

              <p className="mt-7 text-2xs leading-loose opacity-70">
                وتجد شروط الاستخدام وسياسة الخصوصية في{' '}
                <Link
                  href={`/${locale}/legal/privacy`}
                  className="-my-1.5 inline-block py-1.5 font-bold underline underline-offset-2"
                >
                  سياسة الخصوصية
                </Link>{' '}
                و
                <Link
                  href={`/${locale}/legal/terms`}
                  className="-my-1.5 inline-block py-1.5 font-bold underline underline-offset-2"
                >
                  الشروط والأحكام
                </Link>
                . ويعتد بما ورد في هذه الصفحة عند التعارض في مسألة تتعلق بمعالجة
                البيانات الشخصية.
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function Block({ block }: { block: (typeof PDPL_SECTIONS)[number]['blocks'][number] }) {
  if (block.kind === 'text') {
    return <p className="max-w-3xl text-sm leading-loose opacity-85">{bold(block.body)}</p>;
  }

  if (block.kind === 'list') {
    return (
      <ul className="flex max-w-3xl flex-col gap-2.5 text-sm leading-loose opacity-85">
        {block.items.map((item) => (
          <li key={item} className="flex gap-3">
            <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
            <span>{bold(item)}</span>
          </li>
        ))}
      </ul>
    );
  }

  /*
    **والجدولُ جدول.** مددُ الحفظ وأسسُ المعالجة أزواجٌ تُقارَن صفًّا
    بصفّ — وسردُها جملًا يجعل القارئ يُركّب المقارنة في رأسه.
  */
  return (
    /*
      **والجدولُ يُمرَّر على الهاتف ولا يُفيض.** عمودان بنصٍّ عربيٍّ
      على ٣٧٥ بكسلًا يدفعان الصفحة كلَّها أفقيًّا — وهو ما تحرسه
      القياساتُ الدورية.
    */
    <div className="max-w-3xl overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-xs text-start text-2xs">
        <thead>
          <tr className="border-b border-line bg-surface">
            <th className="w-2/5 p-3 text-start font-bold">{block.head[0]}</th>
            <th className="p-3 text-start font-bold">{block.head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row[0]} className="border-b border-line-2 last:border-0">
              <td className="p-3 align-top font-bold">{row[0]}</td>
              <td className="p-3 align-top leading-loose opacity-85">{bold(row[1])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * `**نصّ**` يصير عريضًا — **والتشديدُ جزءٌ من المعنى** في نصٍّ قانونيّ:
 * «لا نبيع بياناتك» و«لا يُتّخذ قرارٌ بالآلة وحدها» جملتان يجب أن
 * تُقرآ ولو مسح القارئ الصفحة بعينه.
 */
function bold(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <b key={i}>{part}</b> : part,
  );
}
