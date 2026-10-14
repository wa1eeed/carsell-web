import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { currentProviderUser } from '@/lib/auth/provider-session';
import { providerQueue } from '@/lib/domain/provider-queue';
import { PROVIDER_REQUEST_STATUS } from '@/lib/labels/provider';
import { ProviderBar } from './ProviderBar';

export const dynamic = 'force-dynamic';

/**
 * ═══ طابورُ المزوّد ═══
 *
 * **ولم يكن للمزوّد سطحٌ أصلًا**: `src/app` فيه `[locale]` و`admin`
 * فقط، فالفاحص لا يرى طلبًا أُسنِد إليه ولا سبيل إلى أن يؤكّد معالجته
 * — وهو ما جعل كل طلبٍ يقف عند `NEW` أبدًا.
 *
 * والترتيب بالمهلة لا بالتاريخ: ما يقترب موعدُه أولى بالنظر.
 */
export default async function ProviderQueuePage() {
  const user = await currentProviderUser();
  if (user === null) redirect('/provider/login');

  const rows = await providerQueue(user.providerId);

  const date = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Riyadh',
  });

  return (
    <>
      <ProviderBar name={user.name} />

      <main className="mx-auto w-full max-w-4xl p-6">
        <h1 className="mb-1.5 text-2xl font-bold tracking-tight">طلباتك</h1>
        <p className="mb-7 text-sm opacity-60">
          المعروضُ على تخصّصك في مدنك، وما قبلتَه. والأقرب موعدًا أوّلًا.
        </p>

        {rows.length === 0 ? (
          <EmptyState
            title="لا طلبات الآن"
            description="يصلك هنا كلُّ طلبٍ مدفوعٍ في تخصّصك ومدنك. ويصلك إشعارٌ عند وصول طلب."
          />
        ) : (
          <div className="flex flex-col divide-y divide-line border-y border-line">
            {rows.map((row) => (
              <Link
                key={row.ref}
                href={`/provider/${encodeURIComponent(row.ref)}`}
                className="flex flex-wrap items-center gap-4 py-4 transition-colors hover:bg-ink/4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{row.serviceName}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2.5 text-3xs opacity-55">
                    <span dir="ltr" className="font-num">
                      {row.ref}
                    </span>
                    {row.city === null ? null : (
                      <>
                        <span aria-hidden className="opacity-40">
                          ·
                        </span>
                        <span>{row.city}</span>
                      </>
                    )}
                    {row.scheduledAt === null ? null : (
                      <>
                        <span aria-hidden className="opacity-40">
                          ·
                        </span>
                        <span className="bidi-isolate">{date.format(new Date(row.scheduledAt))}</span>
                      </>
                    )}
                  </span>
                </span>

                {/*
                  **والمتأخّر يُقال بالوقت لا بالحالة** (البوابة ٤٢):
                  مهلةٌ انقضت ولم تمرّ وظيفةٌ دورية تبقى منقضية.
                */}
                {!row.overdue ? null : <Badge tone="danger">تجاوز المهلة</Badge>}
                <Badge tone={row.status === 'NEW' ? 'accent' : 'neutral'}>
                  {PROVIDER_REQUEST_STATUS[row.status] ?? row.status}
                </Badge>
                <span aria-hidden className="opacity-40">
                  ←
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
