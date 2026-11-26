'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import type { StockAging } from '@/lib/domain/dealer-stock';

/**
 * ═══ `D2d` — البحثُ وبطاقةُ الراكد ═══
 *
 * **والبحثُ برقم الشاص أوّلُ ما يُسأل عنه**: الزميلُ على الهاتف يُملي
 * رقمًا لا اسمًا. والآخِرةُ تكفي — من يحفظ سبعةَ عشرَ محرفًا نادر.
 *
 * **ورأسُ المال الواقف هو ما يُقرأ لا العدد**: «ثلاثُ مركبات راكدة»
 * خبرٌ، و«٢٨٠ ألفًا واقفة» قرار.
 */
export function StockFilters({
  q,
  agedOnly,
  aging,
  agedCount,
  tiedCapital,
  agedWithoutCost,
}: {
  q: string;
  agedOnly: boolean;
  aging: StockAging;
  agedCount: number;
  tiedCapital: string;
  agedWithoutCost: number;
}) {
  const router = useRouter();
  const [term, setTerm] = useState(q);

  const go = (next: { q?: string; aged?: boolean }): void => {
    const params = new URLSearchParams();
    const search = next.q ?? term;
    if (search.trim() !== '') params.set('q', search.trim());
    if (next.aged ?? agedOnly) params.set('aged', '1');
    const query = params.toString();
    router.push(query === '' ? '/dealer/inventory' : `/dealer/inventory?${query}`);
  };

  return (
    <div className="mb-5 flex flex-col gap-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          go({});
        }}
        className="flex flex-wrap items-center gap-2"
      >
        {/*
          **و`dir="ltr"` لأنّه يُنسخ من وثيقة ويُقارن خانةً بخانة** —
          وهي قاعدةُ كلّ حقلٍ يُلصق فيه رمزٌ لاتينيّ.
        */}
        <input
          dir="ltr"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="رقم الشاص أو اللوحة أو الاسم"
          aria-label="ابحث في المخزون"
          className="font-num bidi-ltr min-w-0 flex-1 rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-ink"
        />
        <button
          type="submit"
          className="rounded-btn border border-ink bg-ink px-4 py-2.5 text-2xs font-bold text-bg"
        >
          ابحث
        </button>
        {q === '' ? null : (
          <button
            type="button"
            onClick={() => {
              setTerm('');
              go({ q: '' });
            }}
            className="rounded-btn border border-line px-3.5 py-2.5 text-2xs hover:border-ink"
          >
            امسح
          </button>
        )}
      </form>

      {/*
        ═══ والعتبةُ تُقال ومصدرُها معها ═══

        «أطول من ٤٢ يوما» وحدها تُقرأ رقمًا اخترعناه. ومن يعرف أنّه
        **وسيطُ مكوثِ ما باعه هو** يثق به ويتصرّف عليه.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        <p className="text-2xs leading-loose">
          {agedCount === 0 ? (
            <>
              لا مركبة تجاوزت <Quantity unit="days" count={aging.thresholdDays} /> في المخزون.
            </>
          ) : (
            <>
              {/* **والمعدودُ بصيغته**: «٣ سيارات» لا «٣ سيارة» — والعربيةُ ستُّ حالات. */}
              <b>
                <Quantity unit="cars" count={agedCount} />
              </b>{' '}
              تجاوزت <Quantity unit="days" count={aging.thresholdDays} />
              {/*
                ═══ ورقمٌ لم يُدخَل ليس صفرًا ═══

                حين لا كلفةَ مسجَّلةً لأيٍّ منها كان السطر يطبع «ورأس
                المال الواقف ٠ ريال» — **والفرقُ بين «لا مال واقف» وبين
                «لم يُدخل أحدٌ كلفة» هو الفرقُ كلُّه**، وأحدُهما إنذار.
                وهي قاعدةُ بطاقة المصروف نفسُها.
              */}
              {agedWithoutCost === agedCount ? (
                <span className="opacity-70">
                  {' '}
                  — ولا كلفة مسجلة لأي منها، فلا يحسب رأس المال الواقف
                </span>
              ) : (
                <>
                  {' '}
                  — ورأس المال الواقف{' '}
                  <b>
                    <Money amount={tiedCapital} />
                  </b>
                  {agedWithoutCost === 0 ? null : (
                    <span className="opacity-70">
                      {' '}
                      (وبلا كلفة مسجلة منها <Quantity unit="cars" count={agedWithoutCost} />، فلا
                      تدخل المجموع)
                    </span>
                  )}
                </>
              )}
            </>
          )}
          <br />
          <span className="text-3xs opacity-70">
            {aging.fromOwnMedian ? (
              <>
                والعتبة وسيط مكوث ما بعته، وأساسها{' '}
                <Quantity unit="deals" count={aging.sample} />.
              </>
            ) : (
              <>
                والعتبة حد معلن حتى يتكون وسيطك، وبيعاتك المسجلة{' '}
                <Quantity unit="deals" count={aging.sample} />.
              </>
            )}
          </span>
        </p>

        <button
          type="button"
          onClick={() => go({ aged: !agedOnly })}
          className={
            agedOnly
              ? 'shrink-0 rounded-btn border border-ink bg-ink px-3.5 py-2 text-2xs font-bold text-bg'
              : 'shrink-0 rounded-btn border border-line px-3.5 py-2 text-2xs font-bold hover:border-ink'
          }
        >
          {agedOnly ? 'اعرض الكل' : 'اعرض الراكد وحده'}
        </button>
      </div>
    </div>
  );
}
