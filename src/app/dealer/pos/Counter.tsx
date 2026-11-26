'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';
import type { StockRow } from '@/lib/domain/dealer-dashboard';
import { previewSchedule } from '@/lib/installment-preview';

const field =
  'w-full rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-ink';

const METHODS = [
  { key: 'CASH', label: 'نقدا' },
  { key: 'CARD', label: 'شبكة' },
  { key: 'TRANSFER', label: 'حوالة' },
  /**
   * ═══ والتقسيطُ طريقةُ دفعٍ — وكان البابَ المفقود ═══
   *
   * النطاقُ يقبله والمسارُ يقبله وشاشةُ التقسيط تقول «يفتح العقد من
   * نقطة البيع»، **ولم يكن في الأزرار زرٌّ له**: فمن قرأ تلك الجملة
   * بحث عن اختيارٍ لا وجود له. وهو صنفُ «الطرف الثاني يُبنى مع
   * الأوّل» بعينه.
   */
  { key: 'INSTALLMENTS', label: 'تقسيط' },
] as const;

/**
 * ═══ `D14` — المنضدة ═══
 *
 * عميلٌ واقفٌ أمام الموظّف، فالشاشةُ تُقرأ بترتيب الحديث: أيُّ سيارة،
 * بكم، لمن، كيف دفع. **ولا خطواتٌ ولا معالج**: من يقف عند منضدةٍ
 * والعميلُ ينتظر لا يمشي في سبع شاشات.
 *
 * **والمخزونُ هو المخزون** (طلب المالك): القائمةُ هنا هي صفوفُ
 * `dealerStock` نفسُها — ما يراه في «المركبات» يبيعه من هنا، ولا جدولُ
 * أسعارٍ ثانٍ يتباعد.
 */
export function Counter({
  rows,
  installments: canInstal,
}: {
  rows: readonly StockRow[];
  /** أموديولُ التقسيط في باقته؟ — فزرٌّ يُعرض لمن لا يملكه يردّه الخادم. */
  installments: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [done, setDone] = useState<{
    number: string;
    total: string;
    /** عقدُ التقسيط إن كانت البيعةُ تقسيطًا — ويُقال، ولا يُسكت عنه. */
    plan: { monthly: string } | null;
  } | null>(null);

  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<StockRow | null>(null);
  const [price, setPrice] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerVatNo, setBuyerVatNo] = useState('');
  const [method, setMethod] = useState<string>('CASH');
  const [note, setNote] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [months, setMonths] = useState('12');
  const [startsOn, setStartsOn] = useState('');

  const methods = METHODS.filter((option) => option.key !== 'INSTALLMENTS' || canInstal);

  /**
   * ═══ ويُرى القسطُ قبل أن يُوقَّع ═══
   *
   * «١٢ شهرًا» لا تقول ما يقوله «٦٬٥٤١٫٦٧ شهريًّا». والحسابُ نسخةٌ
   * بلا `Prisma` (`installment-preview`) لأنّ الحدَّ يمنع استيرادَ
   * `money.ts` هنا — **واختبارٌ يقارن ناتجَيهما** فلا تتباعدان.
   */
  const plan = useMemo(() => {
    const total = Number(price);
    const down = downPayment.trim() === '' ? 0 : Number(downPayment);
    const count = Number(months);
    if (!(total > 0) || !(count >= 1) || down < 0 || down >= total) return null;
    /** **والأخيرُ يحمل الكسر** — فيُقال، ولا يُفاجأ به العميل. */
    return previewSchedule(total - down, Math.trunc(count));
  }, [price, downPayment, months]);

  /** **والبحثُ في المعروض لا في الخادم** — القائمةُ بين يديه أصلًا. */
  const found = useMemo(() => {
    const q = term.trim();
    if (q === '') return rows.slice(0, 8);
    const digits = q.replace(/\D/g, '');
    return rows
      .filter(
        (row) =>
          row.title.includes(q) ||
          (digits !== '' && (row.plate ?? '').replace(/\D/g, '').includes(digits)),
      )
      .slice(0, 8);
  }, [rows, term]);

  const sell = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/dealer/pos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vehicleId: picked?.vehicleId,
          price: Number(price),
          buyerName,
          buyerPhone: buyerPhone.trim() === '' ? null : buyerPhone.trim(),
          buyerVatNo: buyerVatNo.trim() === '' ? null : buyerVatNo.trim(),
          method,
          ...(method === 'INSTALLMENTS'
            ? {
                installments: {
                  downPayment: downPayment.trim() === '' ? 0 : Number(downPayment),
                  months: Math.trunc(Number(months)),
                  /**
                   * **والتاريخُ يُرسَل كما يقرؤه المسار**: `YYYY-MM-DD`
                   * وحده — والمسارُ يجعله ظهرَ الرياض فلا ينزلق الأجل
                   * إلى أمس. وأرسلتُه أوّلًا ISO كاملًا فردّ ٤٢٢
                   * صامتًا: عقدُ المسار يُقرأ لا يُتخيّل.
                   */
                  startsOn,
                },
              }
            : {}),
          note: note.trim() === '' ? null : note.trim(),
        }),
      }).catch(() => null);

      const body = (await response?.json().catch(() => null)) as
        | {
            data?: {
              invoiceNumber?: string;
              total?: string;
              plan?: { monthly?: string } | null;
            };
            error?: { messageAr?: string };
          }
        | null;

      if (response === null || !response.ok) {
        setToast(body?.error?.messageAr ?? 'تعذر إتمام البيعة.');
        return;
      }

      /**
       * **ومعاملٌ يُرسَل ولا يُقرأ = صمتٌ بعد نجاح** (قاعدةٌ مسجَّلة):
       * المسارُ يردّ العقدَ وقسطَه، والشاشةُ كانت تهمله — فمن وقّع
       * عميلُه عقدَ أربعةٍ وعشرين شهرًا يرى فاتورةً فقط.
       */
      const monthly = body?.data?.plan?.monthly;
      setDone({
        number: body?.data?.invoiceNumber ?? '',
        total: body?.data?.total ?? '0',
        plan: typeof monthly === 'string' && monthly !== '' ? { monthly } : null,
      });
      setPicked(null);
      setPrice('');
      setBuyerName('');
      setBuyerPhone('');
      setBuyerVatNo('');
      setNote('');
      router.refresh();
    });
  };

  /** **وشرطُ التقسيط يُفحص هنا كما يُفحص في الخادم** — فلا يُرسَل ناقص. */
  const ready =
    picked !== null &&
    Number(price) > 0 &&
    buyerName.trim().length >= 2 &&
    (method !== 'INSTALLMENTS' || (plan !== null && startsOn !== ''));

  if (done !== null) {
    return (
      <section className="max-w-xl rounded-lg border border-accent bg-accent-100/40 p-6">
        <h2 className="text-sm font-bold">تمت البيعة</h2>
        <p className="mt-2.5 text-2xs leading-loose">
          صدرت الفاتورة <b dir="ltr" className="font-num">{done.number}</b> بإجمالي{' '}
          <b>
            <Money amount={done.total} />
          </b>{' '}
          شاملا الضريبة.
        </p>
        {/*
          **والسيارةُ خرجت من السوق** — يُقال صراحةً: من باع في صالته
          وإعلانُه قائمٌ يستقبل عروضًا على سيارةٍ خرجت من بابه.
        */}
        <p className="mt-1.5 text-3xs leading-loose opacity-75">
          وسحبت المركبة من سوق كارز إن كانت معروضة — فلا عرض يصلك عليها بعد اليوم.
        </p>
        {done.plan === null ? null : (
          <p className="mt-1.5 text-3xs leading-loose opacity-75">
            وفتح عقد التقسيط بقسط <Money amount={done.plan.monthly} decimals={2} size="sm" />{' '}
            شهريا — تتابع أقساطه من شاشة التقسيط.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button size="sm" onClick={() => setDone(null)}>
            بيعة أخرى
          </Button>
          {done.plan === null ? null : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push('/dealer/installments')}
            >
              افتح العقد
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => router.push('/dealer/invoices')}>
            افتح الفواتير
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-1 text-sm font-bold">المركبة</h2>
        <p className="mb-3.5 text-3xs leading-loose opacity-70">
          من مخزونك نفسه — ابحث بالاسم أو برقم اللوحة.
        </p>

        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="كامري أو 5615"
          aria-label="ابحث في المخزون"
          className={`${field} mb-3`}
        />

        {rows.length === 0 ? (
          <p className="text-2xs leading-loose opacity-70">
            لا مركبة معروضة للبيع في مخزونك — أضف مركبة من المخزون أولا.
          </p>
        ) : found.length === 0 ? (
          <p className="text-2xs opacity-70">لا مركبة تطابق بحثك.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {found.map((row) => (
              <li key={row.vehicleId}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(row);
                    /** **والسعرُ المعروض مقترَحٌ لا مفروض** — والصالةُ تفاوض. */
                    setPrice(row.askPrice === null ? '' : String(Math.round(Number(row.askPrice))));
                  }}
                  className={
                    picked?.vehicleId === row.vehicleId
                      ? 'w-full rounded-md border border-ink bg-ink p-3 text-start text-bg'
                      : 'w-full rounded-md border border-line p-3 text-start hover:border-ink'
                  }
                >
                  <span className="block text-2xs font-bold">
                    {row.title} {row.year}
                  </span>
                  <span className="mt-0.5 block text-3xs opacity-70">
                    {row.plate ?? 'بلا لوحة'}
                    {row.askPrice === null ? '' : ' · معروضة بـ'}
                    {row.askPrice === null ? '' : Math.round(Number(row.askPrice)).toLocaleString('en')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3.5 text-sm font-bold">البيعة</h2>

        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1">
            <span className="text-3xs opacity-70">السعر المتفق عليه — شامل الضريبة</span>
            <input
              dir="ltr"
              inputMode="numeric"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="92000"
              className={`${field} font-num bidi-ltr`}
            />
            {/*
              ═══ والنصُّ يصف ما يقع لا ما يُظنّ ═══

              كان يقول «والضريبة تحسب عليه» — وتُقرأ «تُضاف فوقه». وهي
              تُحسب **منه**: ٩٩٬٥٠٠ تخرج فاتورتُها ٨٦٬٥٢١٫٧٤ وضريبةً
              ١٢٬٩٧٨٫٢٦. فمن كتب الرقمَ منتظرًا أن يُضاف إليه ١٥٪ يخسر
              ثلاثةَ عشرَ ألفًا ولا يعرف حتى تخرج الورقة.
            */}
            <span className="text-3xs opacity-65">
              اكتب ما يدفعه العميل فعلا — وتفصل الفاتورة الأساس والضريبة منه.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-3xs opacity-70">اسم المشتري — كما في الهوية</span>
            <input
              value={buyerName}
              onChange={(event) => setBuyerName(event.target.value)}
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-3xs opacity-70">جواله — اختياري</span>
            <input
              dir="ltr"
              inputMode="tel"
              value={buyerPhone}
              onChange={(event) => setBuyerPhone(event.target.value)}
              placeholder="05XXXXXXXX"
              className={`${field} font-num bidi-ltr`}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-3xs opacity-70">رقمه الضريبي — إن كان منشأة</span>
            <input
              dir="ltr"
              inputMode="numeric"
              value={buyerVatNo}
              onChange={(event) => setBuyerVatNo(event.target.value)}
              placeholder="3XXXXXXXXXXXXX3"
              className={`${field} font-num bidi-ltr`}
            />
            <span className="text-3xs opacity-65">
              خمسة عشر رقما — وبه تصدر فاتورة كاملة يسترد بها مدخلاته.
            </span>
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-3xs opacity-70">طريقة الدفع</span>
            <span className="flex flex-wrap gap-1.5">
              {methods.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setMethod(option.key)}
                  className={
                    option.key === method
                      ? 'rounded-md border border-ink bg-ink px-3 py-1.5 text-2xs font-bold text-bg'
                      : 'rounded-md border border-line px-3 py-1.5 text-2xs opacity-75 hover:opacity-100'
                  }
                >
                  {option.label}
                </button>
              ))}
            </span>
          </div>

          {method !== 'INSTALLMENTS' ? null : (
            <div className="rounded-md border border-line bg-bg p-3.5">
              <p className="mb-3 text-3xs leading-loose opacity-70">
                العقد يصدر مع الفاتورة، وأقساطه تتابع من شاشة التقسيط.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1">
                  <span className="text-3xs opacity-70">الدفعة الأولى</span>
                  <input
                    dir="ltr"
                    inputMode="decimal"
                    value={downPayment}
                    onChange={(event) => setDownPayment(event.target.value)}
                    className={field}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-3xs opacity-70">عدد الأشهر</span>
                  <input
                    dir="ltr"
                    inputMode="numeric"
                    max={60}
                    value={months}
                    onChange={(event) => setMonths(event.target.value)}
                    className={field}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-3xs opacity-70">أول استحقاق</span>
                  <input
                    type="date"
                    dir="ltr"
                    value={startsOn}
                    onChange={(event) => setStartsOn(event.target.value)}
                    className={field}
                  />
                </label>
              </div>

              {plan === null ? (
                <p className="mt-3 text-3xs opacity-70">
                  اكتب السعر والدفعة الأولى وعدد الأشهر ليظهر القسط.
                </p>
              ) : (
                <p className="mt-3 text-2xs leading-loose">
                  الممول <Money amount={plan.financed} decimals={2} size="sm" /> — القسط{' '}
                  <b>
                    <Money amount={plan.monthly} decimals={2} size="sm" />
                  </b>{' '}
                  شهريا
                  {plan.last === plan.monthly ? null : (
                    <>
                      ، والأخير <Money amount={plan.last} decimals={2} size="sm" /> ليطابق المجموع
                    </>
                  )}
                  .
                </p>
              )}
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-3xs opacity-70">ملاحظة — اختيارية</span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={field}
            />
          </label>

          <Button disabled={!ready || pending} onClick={sell}>
            {pending ? 'يصدر الفاتورة…' : 'أتمم البيعة وأصدر الفاتورة'}
          </Button>
        </div>
      </section>

      {toast === null ? null : <Toast title={toast} />}
    </div>
  );
}
