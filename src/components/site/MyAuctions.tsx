import Link from 'next/link';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Countdown } from '@/components/ui/Countdown';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import type { AccountAuction } from '@/lib/domain/account';

/**
 * ═══ مزاداتي — وكانت غائبةً عن الحساب كلّيًّا ═══
 *
 * التصميم (Wf) يضع قسمًا كاملًا، ولم يكن في بيانات الحساب مزادٌ واحد:
 * فالبائع لا يرى مزاده من حسابه، والمزايد لا يعرف أين وصلت مزايداته
 * إلّا بفتح كل صفحةٍ على حدة.
 *
 * **والدور يغيّر ما يُقال**: البائع يسأل «هل بلغ احتياطيّ؟»، والمزايد
 * يسأل «هل ما زلتُ الأعلى؟». فالسطر الثاني يختلف بينهما.
 */
export function MyAuctions({ rows }: { rows: readonly AccountAuction[] }) {
  // قسمٌ فارغ بعنوانٍ يقول إن المنصّة خالية — فلا يُعرض
  if (rows.length === 0) return null;

  return (
    <section className="mt-9">
      <h2 className="mb-3.5 text-base font-bold">مزاداتي</h2>
      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <li key={`${row.role}-${row.listingRef}`}>
            <Link
              href={row.path}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 hover:opacity-80"
            >
              <span className="flex min-w-48 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-baseline gap-1.5 text-2xs font-bold">
                  <span className="bidi-isolate">{row.title}</span>
                  <ArabicNumber value={row.year} grouped={false} />
                </span>
                <span className="flex flex-wrap items-center gap-2 text-3xs opacity-70">
                  {row.role === 'seller' ? 'تعرضه' : 'تزايد فيه'}
                  <span aria-hidden className="opacity-40">·</span>
                  <Quantity unit="bidders" count={row.bidderCount} />
                </span>
              </span>

              {/*
                **والسطر الثاني يتبع الدور.** «أنت الأعلى» لا تعني شيئًا
                لبائع، و«بلغ الاحتياطي» لا تعني شيئًا لمزايدٍ لا يعرفه.
              */}
              <span className="flex shrink-0 items-center gap-2.5">
                {row.role === 'bidder' ? (
                  row.leading ? (
                    <Badge tone="accent">أنت الأعلى</Badge>
                  ) : (
                    <Badge tone="warn">تجوزت</Badge>
                  )
                ) : row.reserveMet ? (
                  <Badge tone="accent">بلغ الاحتياطي</Badge>
                ) : (
                  <Badge tone="neutral">دون الاحتياطي</Badge>
                )}

                {row.live ? (
                  <Countdown endsAt={row.endsAt} format="full" tone="warn" className="text-3xs" />
                ) : (
                  /* عدّادٌ على صفر يقول «الآن» وهو «انتهى» */
                  <span className="text-3xs opacity-70">انتهى</span>
                )}
              </span>

              <Money amount={Number(row.price)} showCurrency={false} size="sm" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
