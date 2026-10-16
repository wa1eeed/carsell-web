'use client';

import Link from 'next/link';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import type { SaleAgreementView } from '@/lib/domain/documents';

/**
 * ═══ عقد بيع المركبة ═══
 *
 * **ولسنا طرفًا فيه**: العقد بين البائع والمشتري، والمنصّة تُصدره
 * وتحفظه. فلا يُكتب فيه «نتعهّد» ولا «نضمن» — نكتب ما اتُّفق عليه
 * ونُثبت تاريخه.
 *
 * والورقة تُطبع: `print:` تُخفي الترويسة والأزرار، فما يخرج من حوار
 * الطباعة مستندٌ لا لقطةُ شاشة.
 */

const date = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});

export function AgreementSheet({
  agreement,
  backHref,
}: {
  agreement: SaleAgreementView;
  backHref: string;
}) {
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={backHref} className="text-2xs opacity-70 hover:opacity-100">
          ← عودة إلى الطلب
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          تحميل PDF
        </Button>
      </div>

      <article className="rounded-xl border border-line bg-surface p-8 print:rounded-none print:border-0 print:p-0">
        <header className="mb-7 border-b border-line pb-5">
          <h1 className="mb-1.5 text-2xl font-bold">عقد بيع مركبة</h1>
          <p className="text-2xs leading-relaxed opacity-70">
            عقدٌ بين البائع والمشتري، صادرٌ عن كارز CARZ وثيقةً لما اتُّفق عليه.
            <b className="opacity-90"> والمنصّة ليست طرفًا فيه</b> — دورها حفظ المبلغ
            حتى نقل الملكية.
          </p>
          <p className="font-num mt-3 text-3xs opacity-70" dir="ltr">
            {agreement.orderRef}
          </p>
        </header>

        <Pair label="تاريخ الإصدار" value={date.format(new Date(agreement.issuedAt))} />

        <Section title="المركبة">
          <Pair label="المركبة" value={`${agreement.vehicle}`} />
          <Pair label="سنة الصنع" value={<ArabicNumber value={agreement.year} grouped={false} />} />
          <Pair label="رقم الهيكل" value={agreement.vin} ltr />
          {agreement.plate === null ? null : <Pair label="اللوحة" value={agreement.plate} />}
          {agreement.inspectionRef === null ? null : (
            <Pair label="تقرير الفحص" value={agreement.inspectionRef} ltr />
          )}
        </Section>

        <Section title="الطرفان">
          <Pair label="البائع" value={agreement.sellerName} />
          {agreement.sellerIdNo === null ? null : (
            <Pair label="هوية البائع" value={agreement.sellerIdNo} ltr />
          )}
          <Pair label="المشتري" value={agreement.buyerName} />
          {agreement.buyerIdNo === null ? null : (
            <Pair label="هوية المشتري" value={agreement.buyerIdNo} ltr />
          )}
        </Section>

        <Section title="الثمن">
          <Pair
            label="المتّفق عليه"
            value={<Money amount={Number(agreement.price)} size="md" />}
          />
        </Section>

        {agreement.deliveryTerms === null ? null : (
          <Section title="التسليم">
            <p className="text-2xs leading-loose">{agreement.deliveryTerms}</p>
          </Section>
        )}

        {/*
          **والتوقيع خانةٌ تُملأ بيد.** العقد يُطبع ويُوقَّع عند النقل،
          وتوقيعٌ إلكترونيّ يحتاج اعتمادًا لم يصل بعد — فخانةٌ صريحة
          أصدق من ادّعاء توقيعٍ ليس له أثر.
        */}
        <div className="mt-9 grid gap-7 border-t border-line pt-6 sm:grid-cols-2">
          <Signature label="توقيع البائع" />
          <Signature label="توقيع المشتري" />
        </div>
      </article>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2.5 text-3xs font-bold tracking-wider opacity-65">{title}</h2>
      <dl className="flex flex-col gap-2">{children}</dl>
    </section>
  );
}

function Pair({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: React.ReactNode;
  ltr?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line/60 pb-2">
      <dt className="text-2xs opacity-70">{label}</dt>
      {/* ما يُنسخ ويُقارن خانةً بخانة — لاتينيّ معزول */}
      <dd className={ltr ? 'font-num bidi-isolate text-2xs font-bold' : 'text-2xs font-bold'} dir={ltr ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}

function Signature({ label }: { label: string }) {
  return (
    <div>
      <span className="block text-3xs opacity-70">{label}</span>
      <span className="mt-8 block border-b border-ink/40" />
    </div>
  );
}
