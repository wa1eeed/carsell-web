'use client';

import { Year } from '@/components/ui/Year';
import { StatCard as Card, StatGrid } from '@/components/admin/StatCard';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { MonitorTabs } from '@/components/admin/MonitorShell';
import { Badge } from '@/components/ui/Badge';
import { Quantity } from '@/components/ui/Quantity';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { displayDigits } from '@/lib/arabic';
import { cn } from '@/lib/cn';
import type { ReviewEvidence, ReviewRow, ReviewStats } from '@/lib/domain/admin-listings';
import { MIN_REVIEW_NOTE } from '@/lib/domain/review-rules';
import { REVIEW_REASON_AGGREGATE, REVIEW_REASON_LABEL } from '@/lib/labels/review';
import { Duration } from '@/components/ui/Duration';

/**
 * ═══ A15 — مراجعة الإعلانات ═══
 *
 * قرار ٣٣ يُرشّح الإعلان آليًّا، **ولم تكن ثمّة شاشة تقرأ الطابور**.
 * فكل مرشَّح يقف بلا نهاية وصاحبه ينتظر شيئًا لن يقع.
 *
 * ═══ والسبب يُقال بدليله ═══
 *
 * «صورة مكرّرة» تسميةٌ لا حجّة. والمراجع يحتاج **مع أي إعلان**، و**كم
 * نسبة التطابق**، و**كم عمر الحساب** — وإلّا صار قراره تخمينًا سريعًا
 * على وسمٍ لا يفحصه.
 */

// التسميات في `labels/review.ts` — تقرؤها هذه الشاشة وشاشة التفاصيل
const REASON_LABEL = REVIEW_REASON_LABEL;

/**
 * الدليل جملةً — والنطاق أعطى أرقامًا (البوابة ١٧).
 *
 * **ومكوّنٌ لا نصّ**: «عمر الحساب (٣) · إعلاناته (١٢)» التفافٌ على
 * بوابة الجمع يُقرأ أنّ النصّ آليّ، و`<Quantity>` تصوغ الحالات الستّ.
 */
function Evidence({ evidence }: { evidence: ReviewEvidence }) {
  if (evidence.kind === 'DUPLICATE_IMAGE') {
    return (
      <>
        {evidence.otherRef === null
          ? 'صورة مكررة — والإعلان المطابق لم يعد قائما'
          : `تطابق ${displayDigits(String(evidence.matchPct))}٪ مع ${evidence.otherRef}`}
      </>
    );
  }
  if (evidence.kind === 'PRICE_OUTLIER') {
    return (
      <>
        {evidence.marketP25 === null
          ? 'سعر شاذ — ولا إحصاء سوق لهذا الطراز بعد'
          : `أقل ${displayDigits(String(evidence.belowPct))}٪ من ربع السوق الأدنى`}
      </>
    );
  }
  if (evidence.kind === 'NEW_ACCOUNT_BURST') {
    return (
      <>
        حساب عمره <Quantity unit="days" count={evidence.accountAgeDays} /> ·{' '}
        <Quantity unit="listings" count={evidence.listingCount} />
      </>
    );
  }
  return (
    <>
      <Quantity unit="reports" count={evidence.reportCount} />
    </>
  );
}

/**
 * ═══ الدليلُ يُرى لا يُوصَف ═══
 *
 * ترميزُ A15 اسمُه «القرار بدليله»، وجسدُه صورتان متجاورتان ونسبةٌ
 * بينهما. و«تطابق ٩٤٪» سطرًا تطلب من المراجع أن يحكم على **رقم**:
 * والترميز نفسُه يقول إنّ التطابق لا يعني سرقةً دائمًا، فالحكمُ لا
 * يصحّ إلّا بعد أن تُرى الصورتان.
 */
function EvidenceDetail({ evidence }: { evidence: ReviewEvidence }) {
  if (evidence.kind === 'DUPLICATE_IMAGE') {
    if (evidence.otherRef === null) {
      return (
        <p className="text-2xs leading-loose opacity-65">
          رشح لتكرار صورة، <b>ولا إعلان مطابق قائم الآن</b> — حذفه صاحبه أو حذف
          معه. والدليل يعاد حسابه عند العرض فلا يحكم على ما زال.
        </p>
      );
    }

    return (
      <>
        <div className="mb-4 flex items-stretch gap-3.5">
          <figure className="flex flex-1 flex-col gap-1.5">
            <figcaption className="text-3xs font-bold opacity-65">الصورة المرفوعة</figcaption>
            <Frame url={evidence.selfUrl} alt="الصورة المرفوعة في هذا الإعلان" />
          </figure>

          <span className="flex items-center font-num text-2xs font-bold opacity-65">
            {displayDigits(String(evidence.matchPct))}٪
          </span>

          <figure className="flex flex-1 flex-col gap-1.5">
            <figcaption className="truncate text-3xs font-bold opacity-65">
              مطابقة في <span className="font-num">{evidence.otherRef}</span>
            </figcaption>
            <Frame url={evidence.otherUrl} alt={`الصورة المطابقة في ${evidence.otherRef}`} />
          </figure>
        </div>

        {/*
          **والوصفُ يُبنى من المُطابِق لا من الترميز.** يكتب الترميزُ «ومغلق
          منذ ٣ أشهر» عن بياناته هو؛ وإعلانٌ **ما زال معروضًا** بالصورة
          نفسها حجّةٌ أثقل من إعلانٍ أُغلق — فيُقال أيّهما.
        */}
        <p className="text-2xs leading-loose opacity-65">
          الإعلان الآخر لبائع مختلف و
          {evidence.otherLive ? (
            <b>ما زال معروضا</b>
          ) : evidence.otherClosedDays === null ? (
            'غير معروض'
          ) : (
            <>
              مغلق منذ <Duration genitive hours={evidence.otherClosedDays * 24} />
            </>
          )}
          . تطابق الصور لا يعني سرقة دائما — قد تكون المركبة نفسها أعيد بيعها.
        </p>
      </>
    );
  }

  if (evidence.kind === 'PRICE_OUTLIER') {
    return (
      <p className="text-2xs leading-loose opacity-65">
        {evidence.marketP25 === null ? (
          <>
            رشح لسعر شاذ، <b>ولا إحصاء سوق لهذا الطراز بعد</b> — فلا مقارنة تعرض.
          </>
        ) : (
          <>
            السعر المطلوب أقل{' '}
            <span className="font-num">{displayDigits(String(evidence.belowPct))}</span>٪ من ربع
            السوق الأدنى (<Money amount={Number(evidence.marketP25)} />
            ). والسعر المنخفض ليس مخالفة — يرشح لأن الاحتيال يبدأ منه.
          </>
        )}
      </p>
    );
  }

  if (evidence.kind === 'NEW_ACCOUNT_BURST') {
    return (
      <p className="text-2xs leading-loose opacity-65">
        حساب عمره <Quantity unit="days" count={evidence.accountAgeDays} /> نشر{' '}
        <Quantity unit="listings" count={evidence.listingCount} />. والحساب الجديد ليس
        متهما — يرشح أول إعلاناته ثم يمر بلا مراجعة.
      </p>
    );
  }

  return (
    <p className="text-2xs leading-loose opacity-65">
      بلغ عنه مستخدمون: <Quantity unit="reports" count={evidence.reportCount} />. اقرأ البلاغ
      في النزاعات قبل أن تقرر — البلاغ دعوى لا حكم.
    </p>
  );
}

/**
 * موضعُ الصورة — **وفراغُه يقول سببه**.
 *
 * التخزينُ غير مربوط في التطوير (`publicUrl` تعيد `null`)، فمربّعٌ فارغ
 * بلا كلمة يُقرأ «لا صورة في الإعلان» وهو خطأ.
 */
function Frame({ url, alt }: { url: string | null; alt: string }) {
  if (url === null) {
    return (
      <span className="washed flex h-28 items-center justify-center rounded-lg text-3xs opacity-65">
        لا معاينة — التخزين غير مربوط
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- مفتاح R2 خارجيّ بلا مقاسات معروفة
    <img src={url} alt={alt} className="h-28 w-full rounded-lg object-cover" />
  );
}

/** الانتظار — دقائق ثم ساعات، فلا يُقرأ «١٤٠ دقيقة». */

type Decision = 'APPROVE' | 'RETURN' | 'REJECT';

export function ReviewQueue({
  rows,
  stats,
  filter,
  canSuspend,
}: {
  rows: readonly ReviewRow[];
  stats: ReviewStats;
  filter: string | null;
  canSuspend: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  /**
   * **والنافذةُ تحمل ما يُقصد بها.** زرُّ «ارفض وأوقف الحساب» كان يفتح
   * نافذةً عنوانُها «إعادة الإعلان» — جملتان متناقضتان في نافذةٍ تُوقف
   * حسابًا. فالقصدُ يُمرَّر، والعنوانُ والزرُّ الأساسيّ يتبعانه.
   */
  const [open, setOpen] = useState<{ row: ReviewRow; intent: 'RETURN' | 'REJECT' } | null>(null);
  const [note, setNote] = useState('');
  /** المحدَّد للاعتماد الجماعيّ — ويُفرَّغ بعد كل دفعة. */
  const [picked, setPicked] = useState<readonly string[]>([]);
  /**
   * الصفُّ المفتوح دليلُه — **مرجعًا لا صفًّا** (البوابة ٤٧).
   *
   * `useState(rows[0])` تتقادم مع القائمة: يُعتمد صفٌّ فيُحدَّث الطابور
   * ويبقى الدليل المعروض للمحذوف. فالمرجعُ يُحفظ ويُشتقّ الصفُّ منه كلّ
   * مرّة — وإن زال، عاد الدليل إلى أقدم ما ينتظر.
   */
  const [chosen, setChosen] = useState<string | null>(null);
  const current = rows.find((row) => row.ref === chosen) ?? rows[0] ?? null;

  /**
   * **والدفعةُ تُعتمد واحدًا واحدًا في الخادم**، والتقرير يسمّي ما
   * تعذّر — «اعتُمد ٧ من ١٠» يترك المراجع يبحث عن الثلاثة.
   */
  const approveSelected = (): void => {
    if (picked.length === 0) return;
    start(async () => {
      const response = await fetch('/api/v1/admin/listings/review-bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refs: picked }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { data?: { approved: string[]; failed: { ref: string; reason: string }[] } }
        | null;

      if (response === null || !response.ok || payload?.data === undefined) {
        setToast('تعذر الاعتماد.');
        return;
      }
      const { approved, failed } = payload.data;
      setToast(
        failed.length === 0
          ? `المعتمدة (${displayDigits(String(approved.length))})`
          : `المعتمدة (${displayDigits(String(approved.length))}) · تعذر: ${failed
              .map((row) => row.ref)
              .join(' · ')}`,
      );
      setPicked([]);
      router.refresh();
    });
  };

  const decide = (row: ReviewRow, decision: Decision): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/listings/${row.ref}/review`, {
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
        decision === 'APPROVE'
          ? 'اعتمد ونشر.'
          : decision === 'RETURN'
            ? 'أعيد للبائع مع ملاحظتك.'
            : 'رفض الإعلان وأوقف الحساب.',
      );
      router.refresh();
    });
  };

  const tabs = [
    { key: null, label: 'الكل', count: stats.queued },
    ...Object.entries(stats.byReason).map(([key, count]) => ({
      key,
      label: REASON_LABEL[key] ?? key,
      count,
    })),
  ];

  return (
    <>
      <StatGrid>
        <Card
          title="قيد المراجعة"
          value={stats.queued}
          note={
            stats.oldestMinutes === null
              ? 'لا توجد إعلانات للمراجعة'
              : (
                  <>
                    أقدمها منذ <Duration genitive minutes={stats.oldestMinutes} />
                  </>
                )
          }
        />
        <Card
          title="اعتمد اليوم"
          value={stats.approvedToday}
          note={`${displayDigits(String(stats.reviewedSharePct))}٪ من المراجع`}
        />
        {/*
          **والسببُ الأغلب يجعل الرقم قابلًا للتصرّف**: ثلاثةٌ أُعيدت
          لصورٍ مكرّرة تعني قاعدةً تحتاج ضبطًا، وثلاثةٌ لأسبابٍ شتّى
          تعني يومًا عاديًّا. ولا يُخترع سببٌ لصفر.
        */}
        <Card
          title="أعيد للبائع"
          value={stats.returnedToday}
          note={
            stats.topReturnReason === null
              ? 'بملاحظة يقرؤها صاحبه'
              : `${REVIEW_REASON_AGGREGATE[stats.topReturnReason] ?? stats.topReturnReason} غالبا`
          }
        />
        {/*
          **النسبة مقياسُ صحّة قواعد الترشيح لا زينة.** ارتفاع الطابور
          يعني أن قاعدةً صارت واسعة، لا أن المراجعين تأخّروا.
        */}
        <Card
          title="نشر مباشرة بلا مراجعة"
          value={stats.publishedDirectToday}
          note={`${displayDigits(String(stats.directSharePct))}٪ من إعلانات اليوم`}
        />
      </StatGrid>

      {/*
        **الشريط المشترك لا نسخةً يدوية.** كانت هنا نسخةٌ من الشكل
        القديم (عدّادٌ نصٌّ شفّاف)، فترقية المشترك لم تبلغها —
        وشاشتان متجاورتان بشريطين مختلفين تُقرآن كمنتجين.
      */}
      <MonitorTabs tabs={tabs} active={filter ?? null} basePath="/admin/listings" param="reason" />

      {/*
        ═══ «اعتمد المحدَّد» و«الأقدم أولًا» ═══

        الترميز يضعهما فوق الجدول. والترتيبُ **كان واقعًا ولا يُقال**:
        `orderBy: reviewQueuedAt asc` في الاستعلام، ولا شيء على الشاشة
        يقوله — فمن يراجع لا يعرف أنّ أعلى الطابور أقدمُه.

        والاعتمادُ الجماعيُّ يمرّ بـ`decideReview` لكلّ إعلان: الاعتماد
        **ينشر**، وجملةٌ واحدة تنشر ثمانيةَ عشرَ بخطأ سطر.
      */}
      {rows.length === 0 ? null : (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-2xs">
            <input
              type="checkbox"
              checked={picked.length === rows.length && rows.length > 0}
              onChange={() =>
                setPicked(picked.length === rows.length ? [] : rows.map((row) => row.ref))
              }
              className="size-4 accent-ink"
            />
            <span className="opacity-70">حدد الكل</span>
          </label>

          <Button size="sm" disabled={pending || picked.length === 0} onClick={approveSelected}>
            اعتمد المحدد
            {picked.length === 0 ? null : <> ({displayDigits(String(picked.length))})</>}
          </Button>

          <span className="flex-1" />
          <span className="text-3xs opacity-70">الأقدم أولا</span>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="لا شيء ينتظر المراجعة"
          description="لا تدخل القائمة إلا الإعلانات التي ترشحها القواعد. وأكثرها ينشر بلا مراجعة."
        />
      ) : (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {rows.map((row) => (
            <div
              key={row.ref}
              className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <label className="mt-1 flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={picked.includes(row.ref)}
                  onChange={() =>
                    setPicked((current) =>
                      current.includes(row.ref)
                        ? current.filter((entry) => entry !== row.ref)
                        : [...current, row.ref],
                    )
                  }
                  className="size-4 accent-ink"
                />
                <span className="sr-only">اختر {row.ref}</span>
              </label>
              {/* **والصفُّ يفتح دليلَه** — فالقرار على الوسم وحده تخمين. */}
              <button
                type="button"
                aria-pressed={current?.ref === row.ref}
                onClick={() => setChosen(row.ref)}
                className="flex min-w-0 flex-col items-start gap-1 text-start"
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'bidi-isolate truncate text-sm font-bold',
                      current?.ref === row.ref && 'decoration-accent decoration-2 ',
                    )}
                  >
                    {row.title}
                  </span>
                  <Year value={row.year} className="text-2xs opacity-70" />
                </span>
                <span className="font-num text-3xs opacity-70">{row.ref}</span>
                <span className="bidi-isolate text-2xs opacity-70">{row.sellerName}</span>
              </button>
              </div>

              <div className="flex flex-wrap items-center gap-5">
                <div className="flex flex-col items-start gap-1">
                  <Badge tone={row.reason === 'USER_REPORT' ? 'warn' : 'neutral'}>
                    {REASON_LABEL[row.reason] ?? row.reason}
                  </Badge>
                  <span className="text-3xs opacity-70">
                    <Evidence evidence={row.evidence} />
                  </span>
                </div>

                <div className="flex flex-col items-start gap-0.5">
                  <Money amount={Number(row.askPrice)} />
                  <span className="text-3xs opacity-65">
                    {/*
                      **والدقائقُ مدخلُها هي.** كانت تُقسَم على ٦٠ وتُمرَّر
                      ساعاتٍ، و`hours < 1` تُقال «أقل من ساعة» — فطابورٌ كلُّه
                      دقائق يُقرأ أربعةَ صفوفٍ متطابقة، والترميز يكتب «٥١ دقيقة
                      · ٣٨ · ٢٢ · ١٤». والمكوّن يتدرّج بنفسه فوق الستّين.
                    */}
                    منذ <Duration genitive minutes={row.waitingMinutes} />
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* **ولفظُ الزرّ يقول ما يقع** — الاعتماد ينشر، والتوست يقوله أصلًا. */}
                  <Button size="sm" disabled={pending} onClick={() => decide(row, 'APPROVE')}>
                    اعتمد وانشر
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setOpen({ row, intent: 'RETURN' });
                      setNote('');
                    }}
                  >
                    أعده
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/*
        ═══ «لماذا رُشّح» — والقرارُ بجواره ═══

        ترميزُ A15 يضع الدليلَ والقرارَ في لوحةٍ واحدة تحت الطابور: فمن
        يقرأ الحجّة يحكم في موضعه، ولا يعود إلى الصفّ ليتذكّر أيّها كان.
      */}
      {current === null ? null : (
        <section className="mt-7 grid gap-7 rounded-lg border border-line bg-surface p-5 lg:grid-cols-[1.9fr_1fr]">
          <div className="min-w-0">
            <h3 className="mb-3 text-3xs font-bold tracking-[0.16em] opacity-65">
              لماذا رشح — <span className="bidi-isolate">{current.title}</span>
            </h3>
            <EvidenceDetail evidence={current.evidence} />
          </div>

          <div>
            <h3 className="mb-3 text-3xs font-bold tracking-[0.16em] opacity-65">القرار</h3>
            <div className="flex flex-col gap-2.5">
              <Button disabled={pending} onClick={() => decide(current, 'APPROVE')}>
                اعتمد وانشر
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setOpen({ row: current, intent: 'RETURN' });
                  setNote('');
                }}
              >
                أعده للبائع بملاحظة
              </Button>
              {/*
                **ولا يقع الرفض بهذه الضغطة** — يفتح موضعَ الملاحظة، فرفضٌ
                بلا سببٍ مكتوب يوقف حسابًا ولا يُعرف لماذا.
              */}
              {canSuspend ? (
                <Button
                  variant="dangerOutline"
                  disabled={pending}
                  onClick={() => {
                    setOpen({ row: current, intent: 'REJECT' });
                    setNote('');
                  }}
                >
                  ارفض وأوقف الحساب
                </Button>
              ) : null}
            </div>
            <p className="mt-4 border-t border-line pt-3.5 text-3xs leading-loose opacity-65">
              الإعادة والرفض يطلبان ملاحظة يقرؤها البائع. والاعتماد ينشر الإعلان في
              حينه.
            </p>
          </div>
        </section>
      )}

      <p className="mt-7 max-w-2xl rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-75">
        هذه القائمة <b>للإعلانات المرشحة تلقائيا فقط</b>. راجع قواعد الترشيح إذا
        تجاوزت القائمة خمسين إعلانا.
      </p>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={
          open === null
            ? ''
            : open.intent === 'REJECT'
              ? `رفض وإيقاف الحساب — ${open.row.title}`
              : `إعادة الإعلان — ${open.row.title}`
        }
      >
        {open === null ? null : (
          <>
            <p className="mb-4 rounded-md border border-line bg-surface p-3 text-2xs leading-loose opacity-75">
              {open.intent === 'REJECT' ? (
                <>
                  يوقف الإعلان <b>ويوقف حساب البائع</b>، فلا ينشر ولا يشتري. والسبب
                  الذي تكتبه يقرأ في سجل التدقيق وعند أي مراجعة بعدك.
                </>
              ) : (
                <>
                  يعود الإعلان مسودة عند صاحبه، <b>ويقرأ ملاحظتك</b>. وإعادة بلا سبب
                  تجعله ينشره كما هو فيعود إلى القائمة.
                </>
              )}
            </p>

            <label className="flex flex-col gap-1.5">
              <span className="text-2xs font-bold opacity-70">
                {open.intent === 'REJECT' ? 'ما الذي يوجب الإيقاف؟' : 'ما الذي يصلحه؟'}
              </span>
              <textarea
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={
                  open.intent === 'REJECT'
                    ? 'مثال: الصور لإعلان قائم لبائع آخر، والبيانات منسوخة معها.'
                    : 'مثال: الصور مأخوذة من إعلان آخر — ارفع صورا للمركبة نفسها.'
                }
                className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm leading-loose"
              />
            </label>

            <p className="mt-2 text-3xs opacity-65">
              {note.trim().length >= MIN_REVIEW_NOTE ? (
                'يكفي.'
              ) : (
                <>
                  اكتب أكثر — بقي{' '}
                  <span dir="ltr" className="font-num">
                    {MIN_REVIEW_NOTE - note.trim().length}
                  </span>
                </>
              )}
            </p>

            {/*
              **والزرُّ الأساسيّ هو ما ضُغط للوصول إلى هنا** — ويبقى الآخر
              معروضًا تحت خطّ، فمن فتح النافذة للإعادة قد يرى الحجّة أثقل.
            */}
            {open.intent === 'REJECT' ? (
              <>
                <Button
                  variant="dangerOutline"
                  className="mt-4 w-full"
                  disabled={pending || note.trim().length < MIN_REVIEW_NOTE}
                  onClick={() => decide(open.row, 'REJECT')}
                >
                  {pending ? 'جاري…' : 'ارفض وأوقف الحساب'}
                </Button>

                <p className="mt-5 border-t border-line pt-4 text-3xs leading-loose opacity-70">
                  وإن كان خطأ لا احتيالا — الإعادة تكفي والحساب يبقى:
                </p>
                <Button
                  variant="outline"
                  className="mt-2 w-full"
                  disabled={pending || note.trim().length < MIN_REVIEW_NOTE}
                  onClick={() => decide(open.row, 'RETURN')}
                >
                  أعده للبائع بملاحظة
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="mt-4 w-full"
                  disabled={pending || note.trim().length < MIN_REVIEW_NOTE}
                  onClick={() => decide(open.row, 'RETURN')}
                >
                  {pending ? 'جاري…' : 'أعده للبائع بملاحظة'}
                </Button>

                {canSuspend ? (
                  <>
                    <p className="mt-5 border-t border-line pt-4 text-3xs leading-loose opacity-70">
                      وإن كان الإعلان احتيالا لا خطأ:
                    </p>
                    <Button
                      variant="dangerOutline"
                      className="mt-2 w-full"
                      disabled={pending || note.trim().length < MIN_REVIEW_NOTE}
                      onClick={() => decide(open.row, 'REJECT')}
                    >
                      ارفض وأوقف الحساب
                    </Button>
                  </>
                ) : null}
              </>
            )}
          </>
        )}
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

