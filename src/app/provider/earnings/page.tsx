import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { AR_DATE_LOCALE, displayDigits } from '@/lib/arabic';
import { currentProviderUser } from '@/lib/auth/provider-session';
import { providerIbanMasked, providerPayoutLines } from '@/lib/domain/provider-payouts';
import { providerLedger } from '@/lib/domain/provider-ledger';
import { PROVIDER_SELF_EVENT_LABEL, PROVIDER_SELF_NOTELESS } from '@/lib/labels/provider';
import { ProviderBar } from '../ProviderBar';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'مستحقّاتك' };

/**
 * ═══ كشفُ المزوّد — الطرف الثاني من الصرف ═══
 *
 * بُني طابورُ الصرف في الأدمن، **ولوحةُ المزوّد لا تعرض ريالًا**: لا
 * رصيدًا ولا كشفًا ولا ما وصله. فنحوّل إليه مالًا ولا يراه عندنا، ثم
 * يسأل «كم لي؟» في مكالمة — وهو السؤال الذي يجب أن تجيبه شاشة.
 *
 * ═══ وما وصل وما بقي سطران لا سطر ═══
 *
 * «مستحقّ» وحدها تُقرأ على وجهين: مجموعَ ما كسبه، أو ما بقي له. فهما
 * مفصولان باسمهما — والثالث **ما حُوِّل** بمرجع حوالته، فيطابقه بكشف
 * مصرفه.
 *
 * **وبالهللات**: رقمٌ يُطابَق بطرفٍ خارجيّ، وتقريبُه إلى الريال يصنع
 * خلافًا على فروقٍ لا يجدها أحد.
 */
export default async function ProviderEarningsPage() {
  const user = await currentProviderUser();
  if (user === null) redirect('/provider/login');

  const [ledger, sent, iban] = await Promise.all([
    providerLedger(user.providerId),
    providerPayoutLines(user.providerId, 50),
    providerIbanMasked(user.providerId),
  ]);

  const date = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Riyadh',
  });

  return (
    <>
      <ProviderBar name={user.name} />

      <main className="mx-auto w-full max-w-4xl p-6">
        <h1 className="mb-1.5 text-2xl font-bold tracking-tight">مستحقّاتك</h1>
        <p className="mb-7 text-sm leading-loose opacity-70">
          ما استُحقّ لك عن الخدمات التي أنجزتَها، وما حُوِّل إلى حسابك منه. والحوالة تُنفَّذ
          من بنكنا إلى حسابك، ويُسجَّل مرجعُها هنا.
        </p>

        <div className="mb-9 grid gap-px border border-line bg-line sm:grid-cols-3">
          <Figure label="لك الآن" amount={ledger.balance} strong />
          <Figure label="مجموع ما استُحقّ" amount={ledger.credited} />
          <Figure label="ما حُوِّل إليك" amount={ledger.debited} />
        </div>

        {/* ═══ أين يُحوَّل — وغيابُه سببُ تأخّر الحوالة ═══ */}
        <section className="mb-9">
          <h2 className="mb-3 text-sm font-bold">حسابك البنكيّ</h2>
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-4">
            {iban === null ? (
              <>
                <p className="text-2xs leading-loose opacity-70">
                  لا حساب مسجَّل — ولا تُنفَّذ حوالةٌ قبله. أبلِغ من يدير حسابك عندنا
                  ليُسجّله.
                </p>
                <Badge tone="warn">لم يُسجَّل</Badge>
              </>
            ) : (
              <>
                <p className="text-2xs leading-loose opacity-70">
                  إليه تُنفَّذ الحوالات. ولتبديله راجِعنا — فتبديلُه بيد المالية.
                </p>
                <span dir="ltr" className="font-num text-sm font-bold">
                  {displayDigits(iban)}
                </span>
              </>
            )}
          </div>
        </section>

        {/* ═══ ما وصل فعلًا — المُرسَل وحده ═══ */}
        <section className="mb-9">
          <h2 className="mb-3 text-sm font-bold">الحوالات</h2>
          {sent.length === 0 ? (
            <p className="border-y border-line py-4 text-2xs leading-loose opacity-65">
              لم تخرج حوالةٌ بعد. وما لك الآن يبقى مقيَّدًا باسمك حتى تُنفَّذ.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line border-y border-line">
              {sent.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-2xs">{date.format(new Date(row.sentAt))}</span>
                    <span className="text-3xs opacity-65">
                      مرجع الحوالة
                      {/* يُقارن بكشف المصرف خانةً بخانة — فيُعزل اتجاهه */}
                      <span dir="ltr" className="font-num mx-1">
                        {row.bankRef ?? '—'}
                      </span>
                    </span>
                  </div>
                  <Money amount={Number(row.amount)} decimals={2} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ═══ والكشف كاملًا — كل حركةٍ على حسابك ═══ */}
        <section>
          <h2 className="mb-3 text-sm font-bold">كشف الحساب</h2>
          {ledger.lines.length === 0 ? (
            <p className="border-y border-line py-4 text-2xs leading-loose opacity-65">
              لا حركة بعد. وأوّلُ خدمةٍ تُنجزها تُقيَّد لك هنا.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line border-y border-line">
              {ledger.lines.map((line) => {
                const amount = Number(line.amount);
                return (
                  <li
                    key={line.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-2xs">
                        {PROVIDER_SELF_EVENT_LABEL[line.event] ?? line.event}
                      </span>
                      <span className="text-3xs opacity-65">
                        {date.format(new Date(line.at))}
                        {line.note === null || PROVIDER_SELF_NOTELESS.includes(line.event) ? null : (
                          <>
                            {' · '}
                            <span dir="ltr" className="bidi-isolate">
                              {line.note}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      {/*
                        **والسالب يحتفظ بإشارته يسارًا** — و`Money`
                        تتولّاها بـ`negative` فلا تُكتب بيد.
                      */}
                      <Money
                        amount={Math.abs(amount)}
                        decimals={2}
                        size="sm"
                        negative={amount < 0}
                      />
                      <span className="text-3xs opacity-65">
                        الرصيد
                        <span className="mx-1">
                          <Money
                            amount={Number(line.runningBalance)}
                            decimals={2}
                            size="sm"
                            showCurrency={false}
                          />
                        </span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function Figure({
  label,
  amount,
  strong,
}: {
  label: string;
  amount: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 bg-bg p-5">
      <span className="text-3xs opacity-70">{label}</span>
      <Money amount={Number(amount)} size={strong === true ? 'lg' : 'md'} decimals={2} />
    </div>
  );
}
