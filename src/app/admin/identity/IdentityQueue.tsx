'use client';

import { StatCard as Card, StatGrid } from '@/components/admin/StatCard';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Sheet';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Toast } from '@/components/ui/Toast';
import { displayDigits } from '@/lib/arabic';
import type { IdentityRow, IdentityStats } from '@/lib/domain/admin-identity';
import { MIN_IDENTITY_NOTE } from '@/lib/domain/identity-rules';
import { Duration } from '@/components/ui/Duration';
import { Quantity } from '@/components/ui/Quantity';

/**
 * ═══ A18 — توثيق الهوية ═══
 *
 * **لم يكن أحدٌ يوثَّق إطلاقًا**: `idVerified` بلا كاتب، ولا شاشة تعرض
 * من قدّم هويته — وحارس الشراء يقرؤه. فكل حساب ممنوع من كل معاملة،
 * والباب الذي يُستوفى منه غير موجود.
 *
 * ═══ والرقم لا يُعرض هنا ═══
 *
 * القائمة تعرض الاسم والجوال والطريقة. وكشفُ رقم الهوية فعلٌ مستقلّ
 * بسببٍ مكتوب — فلا يمرّ الاطّلاع عرَضًا لأن مراجعًا فتح شاشة.
 */

const METHOD_LABEL: Record<string, string> = {
  manual: 'إدخال يدوي',
  nafath: 'النفاذ الوطني',
  commercial_register: 'سجل تجاري',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'ينتظر',
  CLARIFICATION: 'معلق للتوضيح',
  VERIFIED: 'موثق',
  REJECTED: 'مرفوض',
};


type Decision = 'VERIFY' | 'CLARIFY' | 'REJECT';

export function IdentityQueue({
  rows,
  stats,
}: {
  rows: readonly IdentityRow[];
  stats: IdentityStats;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState<IdentityRow | null>(null);
  const [note, setNote] = useState('');

  const decide = (row: IdentityRow, decision: Decision): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/identity/${row.userId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, note: note.trim() === '' ? null : note.trim() }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر تنفيذ القرار.');
        return;
      }

      setOpen(null);
      setNote('');
      setToast(
        decision === 'VERIFY'
          ? 'وثق الحساب — وصار يستطيع النشر والشراء.'
          : decision === 'CLARIFY'
            ? 'تم طلب التوضيح. يبقى في قائمة التوثيق.'
            : 'رفض التوثيق، والسبب مسجل.',
      );
      router.refresh();
    });
  };

  return (
    <>
      <StatGrid>
        <Card
          title="ينتظر مراجعة يدوية"
          value={stats.waiting}
          note={
            stats.oldestMinutes === null
              ? 'لا توجد طلبات توثيق'
              : (
                  <>
                    أقدمها منذ <Duration genitive hours={stats.oldestMinutes / 60} />
                  </>
                )
          }
        />
        <Card title="معلق للتوضيح" value={stats.clarification} note="ينتظر رد صاحبه" />
        {/*
          ═══ واليومُ لا العمر كلُّه ═══

          «موثّق ١٬٤٢٨» عددٌ لا يتحرّك بعمل اليوم، فلا يقول للمراجع
          شيئًا عن يومه — والترميز يضع «وُثّق اليوم» و«رُفض اليوم».
          والعمرُ كلُّه يبقى سطرًا تحتهما لا بطاقةً فوقهما.
        */}
        <Card
          title="وثق اليوم"
          value={stats.verifiedToday}
          note={
            stats.verifiedToday === 0 ? (
              <>الإجمالي <ArabicNumber value={stats.verifiedTotal} /></>
            ) : (
              <>
                <span>
                  بالنفاذ <ArabicNumber value={stats.verifiedTodayNafath} />
                </span>
                <span aria-hidden className="opacity-40"> · </span>
                <span>
                  يدويا{' '}
                  <ArabicNumber value={stats.verifiedToday - stats.verifiedTodayNafath} />
                </span>
              </>
            )
          }
        />
        <Card
          title="رفض اليوم"
          value={stats.rejectedToday}
          note={
            stats.lastRejectionNote === null
              ? 'لا رفض اليوم'
              : /* **«آخرها» لا «أكثرها»** — الأسباب نصٌّ حرّ، والأشيعُ تصنيفٌ لا عدّ. */
                `آخرها: ${stats.lastRejectionNote.slice(0, 60)}`
          }
        />
        {/*
          **النسبة مقياسٌ لطول الطابور لا زينة**: كلّما ارتفعت قلّ ما
          ينتظر إنسانًا — والتصميم يقولها في العنوان.
        */}
        <div className="rounded-lg border border-line bg-surface p-5">
          <p className="mb-2 text-2xs opacity-70">نسبة النفاذ الوطني</p>
          <span className="font-num text-3xl font-bold">
            {displayDigits(String(stats.nafathSharePct))}٪
          </span>
          <p className="mt-1.5 text-3xs opacity-70">كلما ارتفعت قلت الطلبات المعلقة</p>
        </div>
      </StatGrid>

      {rows.length === 0 ? (
        <EmptyState
          title="لا أحد ينتظر التوثيق"
          description="يصل هنا الإدخال اليدوي والسجل التجاري. وكله يراجعه إنسان."
        />
      ) : (
        <>
          {/*
            **والترتيبُ يُقال.** الطابور `identitySubmittedAt: 'asc'`
            منذ كُتب، ولا سطر يقوله — فمن يفتحه لا يعرف أيُراجع من
            أعلى القائمة أم يبحث عن الأقدم بنفسه. والترميز يسمّيه.
          */}
          <p className="mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-65">الأقدم أولا</p>
          <div className="flex flex-col divide-y divide-line border-y border-line">
          {rows.map((row) => (
            <div
              key={row.userId}
              className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="bidi-isolate truncate text-sm font-bold">
                  {/*
                    **ولا صفحةَ توثيقٍ منفصلة**: ملفّ العميل فيه حالة
                    التوثيق وتاريخُها — **والرقم يبقى خلف مساره المُقيَّد**
                    الذي يكتب أثرًا بكل قراءة، لا في صفحةٍ تُفتح عرَضًا.
                  */}
                  <Link
                    href={`/admin/users/${row.userId}`}
                    className="hover:opacity-70"
                  >
                    {row.name ?? 'بلا اسم'}
                  </Link>
                </span>
                {/* الجوال يُقارن خانةً بخانة — لاتينيّ معزول */}
                <span dir="ltr" className="font-num text-2xs opacity-70">
                  {row.phone}
                </span>

                {/*
                  ═══ ومراجعةُ المنشأة غيرُ مراجعة الفرد ═══

                  الأولى تُقابل السجلّ بالشهادة وتفحص سريانه، والثانية
                  تُقابل الاسم بالهوية. وصفٌّ لا يقول أيَّهما يجعل
                  المحرّر يفتح كلَّ طلبٍ ليعرف ما يطلبه.

                  **والمنتهي يُقال هنا**: سجلٌّ انتهى يُردّ، ومعرفتُه
                  قبل الفتح توفّر فتحةً كاملة.
                */}
                {row.business === null ? null : (
                  <span className="flex flex-wrap items-center gap-2 text-3xs">
                    <Badge tone="neutral">منشأة</Badge>
                    <span className="opacity-70">{row.business.name}</span>
                    <span dir="ltr" className="font-num opacity-70">
                      {displayDigits(row.business.crNumber)}
                    </span>
                    {row.business.crExpiresAt === null ||
                    Date.parse(row.business.crExpiresAt) > Date.now() ? null : (
                      <Badge tone="danger">سجل منتهي</Badge>
                    )}
                    {row.business.vatNumber === null ? (
                      <span className="opacity-65">غير مسجل في الضريبة</span>
                    ) : null}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-5">
                <div className="flex flex-col items-start gap-1">
                  <Badge tone={row.status === 'CLARIFICATION' ? 'warn' : 'neutral'}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </Badge>
                  <span className="text-3xs opacity-70">
                    {row.method === null ? '—' : (METHOD_LABEL[row.method] ?? row.method)}
                  </span>
                </div>

                <div className="flex flex-col items-start gap-0.5">
                  <span className="text-2xs opacity-75">
                    <Quantity unit="listings" count={row.listingCount} />
                  </span>
                  <span className="text-3xs opacity-65">منذ <Duration genitive hours={row.waitingMinutes / 60} /></span>
                </div>

                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setOpen(row);
                    setNote(row.note ?? '');
                  }}
                >
                  راجع
                </Button>
              </div>
            </div>
          ))}
          </div>
        </>
      )}

      <p className="mt-7 max-w-2xl rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-75">
        <b>ما يفتحه التوثيق:</b> نشر إعلان · تقديم عرض · المزايدة · استلام مبالغ. والتصفح
        والمفضلة متاحان بلا توثيق.
      </p>

      {/*
        ═══ سياسةُ الرفض — والخطُّ بين «وضّح» و«ارفض» ═══

        الترميز يضعها في رأس الشاشة. وقيمتُها اتّساقُ القرار: مراجعان
        يقرآن الصورةَ نفسها ويقرّران غيرَ ذلك، فصاحبُ الطلب يُرفض عند
        أحدهما ويُوثَّق عند الآخر.

        **والخطّ الفاصل هو النقصُ مقابل التعارض**: ما ينقص يُستكمَل،
        وما يتعارض يُرفض. ورفضُ ناقصٍ يُطيل الدورة بين الطرفين — وهي
        الدورة التي يحرسها اشتراطُ السبب في `decideIdentity`.
      */}
      <section className="mt-5 rounded-lg border border-line bg-surface p-5.5">
        <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-65">سياسة الرفض</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-2xs font-bold">اطلب توضيحا — النقص يستكمل</p>
            <ul className="flex flex-col gap-1.5 text-2xs leading-loose opacity-72">
              <li>صورة غير واضحة أو منخفضة الدقة أو مقصوصة الأطراف.</li>
              <li>الهوية منتهية، أو سجل تجاري قارب انتهاءه.</li>
              <li>اختلاف الاسم اختصارا: «عبدالله م. الحربي» مقابل «عبدالله محمد الحربي» مقبول.</li>
              <li>نقص مستند يكمل الملف.</li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-2xs font-bold">ارفض بسبب مكتوب — التعارض لا يستكمل</p>
            <ul className="flex flex-col gap-1.5 text-2xs leading-loose opacity-72">
              <li>اختلاف الاسم الأول أو العائلة — لا الاختصار.</li>
              <li>صورة لهوية شخص آخر، أو مستند معدل.</li>
              <li>بيانات لا تطابق المدخل: رقم هوية أو تاريخ ميلاد مختلف.</li>
              <li>تكرار الرفض على التوضيح نفسه ثلاث مرات.</li>
            </ul>
          </div>
        </div>
        <p className="mt-4 border-t border-line pt-3 text-3xs leading-loose opacity-65">
          والسبب يقرؤه صاحب الطلب بنصه — فاكتبه له لا لنفسك. ورفض بلا سبب يجعله يرفع
          الصورة نفسها فيرفض ثانية، ودورة لا تنتهي بين الطرفين.
        </p>
      </section>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === null ? '' : `مراجعة — ${open.name ?? open.phone}`}
      >
        {open === null ? null : (
          <>
            <dl className="mb-4 flex flex-col gap-2.5 border-b border-line pb-4 text-2xs">
              <Line label="الاسم" value={open.name ?? 'بلا اسم'} />
              <Line label="الجوال" value={open.phone} mono />
              <Line
                label="الطريقة"
                value={open.method === null ? '—' : (METHOD_LABEL[open.method] ?? open.method)}
              />
            </dl>

            {/*
              ═══ البياناتُ المُدخَلة — ما يُقارَن ═══

              ملاحظةُ الترميز كلُّها عن **مقابلةِ اسم حساب البنك باسم
              الهوية**، وكان المراجع يقرّر بلا أن يرى الاسمَ الذي
              يقابله: فيفتح شاشةَ العملاء ليقارن، أو يوثّق بلا مقارنة —
              وهي المقارنةُ التي بُني الطابور لأجلها.

              **والآيبان بأربع خانات**: تكفي للمطابقة ولا تكفي للتحويل.
            */}
            {open.bankName === null && open.ibanMasked === null ? null : (
              <>
                <h3 className="mb-2 text-3xs font-bold tracking-[0.14em] opacity-65">
                  البيانات المدخلة
                </h3>
                <dl className="mb-4 flex flex-col gap-2.5 text-2xs">
                  {/*
                    **والاسمُ اسمُ البنك لا اسمُ صاحب الحساب.** أوّلُ صياغةٍ
                    كتبت «اسم حساب البنك» فوق «البلاد» — ووسمٌ يَعِد ببيانٍ
                    ويعرض غيرَه أسوأ من غيابه.
                  */}
                  <Line label="البنك" value={open.bankName ?? 'لم يدخله بعد'} />
                  <Line label="الآيبان" value={open.ibanMasked ?? 'لم يدخله بعد'} mono />
                </dl>
                {/*
                  ═══ واسمُ صاحب الحساب غيرُ مجموع ═══
                  
                  ملاحظةُ الترميز كلُّها عن مقابلةِ **اسم صاحب الحساب** باسم
                  الهوية («عبدالله م. الحربي» مقابل «عبدالله محمد الحربي»)،
                  ولا حقلَ له في `User`: فيه البنكُ والآيبان وحدهما. فلا
                  تُكتب الملاحظةُ — جملةٌ تشرح مقارنةً لا تملك الشاشةُ طرفَها
                  تجعل المراجعَ يبحث عن بيانٍ غير موجود.
                */}
              </>
            )}

            {/*
              **رقم الهوية لا يُعرض هنا.** كشفُه فعلٌ مستقلّ بسببٍ
              مكتوب من شاشة العملاء — فلا يمرّ الاطّلاع عرَضًا مع كل قرار.
            */}
            <p className="mb-4 rounded-md border border-line bg-surface p-3 text-3xs leading-loose opacity-75">
              رقم الهوية لا يعرض في هذه الشاشة. كشفه من شاشة العملاء بسبب مكتوب،
              وكل عملية اطلاع مسجلة.
            </p>

            <label className="flex flex-col gap-1.5">
              <span className="text-2xs font-bold opacity-70">
                ما الذي ينقص أو يمنع؟ يقرؤه صاحب الطلب
              </span>
              <textarea
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="مثال: اسم صاحب الآيبان يخالف اسم الهوية — راجعه وأعد التقديم."
                className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm leading-loose"
              />
            </label>

            {/* **وللأزرار عنوان** — كالترميز: ثلاثةُ مساراتٍ تُقرأ قرارًا واحدًا. */}
            <h3 className="mt-4 text-3xs font-bold tracking-[0.14em] opacity-65">القرار</h3>
            <div className="mt-2 flex flex-col gap-2">
              <Button className="w-full" disabled={pending} onClick={() => decide(open, 'VERIFY')}>
                وثق الحساب
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={pending || note.trim().length < MIN_IDENTITY_NOTE}
                onClick={() => decide(open, 'CLARIFY')}
              >
                اطلب توضيحا (يبقى في القائمة)
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={pending || note.trim().length < MIN_IDENTITY_NOTE}
                onClick={() => decide(open, 'REJECT')}
              >
                ارفض بسبب مكتوب
              </Button>
            </div>
          </>
        )}
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="opacity-70">{label}</dt>
      <dd className={mono === true ? 'font-num' : 'bidi-isolate truncate'} dir={mono === true ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}
