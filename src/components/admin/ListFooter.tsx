import { ArabicNumber } from '@/components/ui/ArabicNumber';

/**
 * ═══ تذييل القوائم — الحدّ والسياق وما يملكه الأدمن ═══
 *
 * التصميم يُنهي كل شاشة قائمة بثلاثة:
 *
 * **١· سطر المدى**: «١–٦ من ١٤ … متوسط البقاء ٤ ساعات». والمهمّ فيه
 * أنه يقول **كم لم يُعرض**: قائمةٌ مقتطعة بلا سطرٍ يقول ذلك تُقرأ على
 * أنها كلّ ما في القاعدة، فيُبنى على ستّين صفًّا قرارٌ عن ثلاث مئة.
 *
 * **٢· ما يفعله الأدمن هنا** و**٣· ما لا يملكه**. وهما ليسا زينةً:
 * الحدّ المكتوب يمنع السؤال «لماذا لا أستطيع؟» ويمنع محاولةً تُرفض،
 * **ويقول للمشغّل الجديد ما هي هذه الشاشة** قبل أن يجرّب.
 */
export function ListFooter({
  shown,
  total,
  note,
  can,
  cannot,
  automatic,
}: {
  /** المعروض الآن — بعد الشريحة والبحث. */
  shown: number;
  /** الكلّ في هذه الشريحة؛ و`null` حين لا يُعرف. */
  total: number | null;
  /** سياقٌ قصير: متوسّط البقاء، أقدم عنصر… */
  note?: string;
  can: string;
  cannot: string;
  automatic?: string;
}) {
  const truncated = total !== null && total > shown;

  return (
    <>
      <p className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-3xs opacity-70">
        <span className="font-num">
          <ArabicNumber value={shown} />
        </span>
        {total === null ? null : (
          <>
            <span>من</span>
            <span className="font-num">
              <ArabicNumber value={total} />
            </span>
          </>
        )}
        {/*
          **والمقتطَع يُقال.** قائمةٌ تُعرض ستّين من ثلاث مئة بلا سطرٍ
          يقول ذلك يُبنى عليها قرارٌ عن كلٍّ لم يُرَ.
        */}
        {truncated ? (
          <span className="rounded-full bg-warn-100 px-2 py-px font-bold text-warn-900">
            معروض جزء منها — ضيق بالبحث أو الشريحة
          </span>
        ) : null}
        {note === undefined ? null : (
          <>
            <span aria-hidden className="opacity-40">·</span>
            <span>{note}</span>
          </>
        )}
      </p>

      <div className="mt-5 grid gap-3.5 md:grid-cols-3">
        <Note title="ما يفعله الأدمن هنا" body={can} />
        <Note title="لا يملك الأدمن" body={cannot} tone="warn" />
        {automatic === undefined ? null : <Note title="تنبيهات آلية" body={automatic} />}
      </div>
    </>
  );
}

function Note({
  title,
  body,
  tone = 'plain',
}: {
  title: string;
  body: string;
  tone?: 'plain' | 'warn';
}) {
  return (
    <section
      className={
        tone === 'warn'
          ? 'rounded-lg border border-warn-200 bg-warn-100 p-4.5'
          : 'rounded-lg border border-line bg-surface p-4.5'
      }
    >
      <h3
        className={
          tone === 'warn'
            ? 'mb-2 text-3xs font-bold tracking-[0.14em] text-warn-900 opacity-80'
            : 'mb-2 text-3xs font-bold tracking-[0.14em] opacity-65'
        }
      >
        {title}
      </h3>
      <p
        className={
          tone === 'warn'
            ? 'text-2xs leading-loose text-warn-900'
            : 'text-2xs leading-loose opacity-72'
        }
      >
        {body}
      </p>
    </section>
  );
}
