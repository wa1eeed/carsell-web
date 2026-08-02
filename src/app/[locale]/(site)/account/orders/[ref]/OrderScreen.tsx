'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { StageTracker } from '@/components/ui/StageTracker';
import type { PublicOrder } from '@/lib/domain/orders';

/**
 * Wj — الطلب.
 *
 * **بطاقة الضمان تقول أين المال الآن**، لا «قيد المعالجة». المشتري دفع
 * ويريد أن يعرف أن مبلغه محجوز ولم يصل البائع؛ والبائع يريد أن يعرف أنه
 * محجوز فعلًا لا موعودًا.
 */
export function OrderScreen({
  order,
  formatted,
}: {
  order: PublicOrder;
  formatted: {
    createdAt: string;
    stageEnteredAt: string;
    paymentDueAt: string | null;
    slaDueAt: string | null;
  };
}) {
  const t = useTranslations('order');
  const te = useTranslations('enums');

  const days = Math.floor(order.dwellSeconds / 86_400);
  const frozen = order.status === 'DISPUTED';

  return (
    <>
      {/* النزاع يتصدّر: ما دام مفتوحًا فهو حال الطلب لا حاشيته */}
      {order.dispute === null ? null : (
        <section className="mb-7 rounded-xl border border-warn-200 bg-warn-100 p-5 text-warn-900">
          <h2 className="mb-1.5 text-base font-bold">{t('disputeOpen')}</h2>
          <p className="mb-2.5 text-xs leading-loose opacity-85">{t('disputeFrozen')}</p>
          <p className="flex flex-wrap items-center gap-2 text-2xs">
            <Badge tone="warn">{te(`disputeStatus.${order.dispute.status}`)}</Badge>
            <span className="flex items-center gap-1.5">
              {t('slaDue')} <span className="bidi-isolate font-bold">{formatted.slaDueAt}</span>
            </span>
          </p>
        </section>
      )}

      <StageTracker current={order.stage} className="mb-8" />

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="min-w-0 flex-1">
          <section className="mb-6 rounded-xl border border-line bg-surface p-5">
            <h2 className="mb-3.5 text-sm font-bold">{t('vehicle')}</h2>
            <Link
              href={order.listing.path}
              className="flex flex-wrap items-baseline gap-2 text-base font-bold hover:underline"
            >
              <span className="bidi-isolate">{order.listing.title}</span>
              <ArabicNumber value={order.listing.year} grouped={false} />
            </Link>
            <p className="mt-2 flex flex-wrap items-center gap-2.5 text-2xs opacity-55">
              <span className="font-num">{order.listing.ref}</span>
              <span aria-hidden className="opacity-40">·</span>
              <span>{te(`orderSource.${order.source}`)}</span>
              <span aria-hidden className="opacity-40">·</span>
              <span className="bidi-isolate">{formatted.createdAt}</span>
            </p>
          </section>

          <section className="mb-6 rounded-xl border border-line bg-surface p-5">
            <h2 className="mb-3.5 text-sm font-bold">{t('timeline')}</h2>
            <ul className="flex flex-col gap-3.5">
              {order.events.map((event, i) => (
                <li key={i} className="flex items-start gap-3.5">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold">{t(`event.${event.type}`)}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-3xs opacity-50">
                      {event.toStage === null ? null : (
                        <span>{te(`orderStage.${event.toStage}`)}</span>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="w-full shrink-0 lg:w-80">
          {/* ═══ بطاقة الضمان — أين المال الآن ═══ */}
          {order.escrow === null ? null : (
            <section className="mb-3.5 rounded-xl border-2 border-ink p-5">
              <h2 className="mb-1.5 text-sm font-bold">{t('escrow')}</h2>
              <p className="mb-3.5 text-2xs leading-loose opacity-65">
                {t(`escrowState.${order.escrow.status}`)}
              </p>
              <Money amount={Number(order.escrow.amount)} size="xl" />
              <Badge
                tone={order.escrow.status === 'HELD' ? 'accent' : 'neutral'}
                className="mt-3.5"
              >
                {te(`escrowStatus.${order.escrow.status}`)}
              </Badge>
            </section>
          )}

          <section className="mb-3.5 rounded-xl border border-line p-5">
            <h2 className="mb-3 text-xs font-bold">{t('amounts')}</h2>
            {(
              [
                ['price', order.amounts.agreedPrice],
                ['commission', order.amounts.commission],
                ['transferFee', order.amounts.transferFee],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-4 py-1.5 text-sm">
                <span className="opacity-60">{t(key)}</span>
                <ArabicNumber value={Number(value)} className="font-bold" />
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between gap-4 border-t border-line pt-3 text-base font-bold">
              <span>{t('total')}</span>
              <ArabicNumber value={Number(order.amounts.total)} />
            </div>
            <p className="mt-2 text-3xs opacity-45">{t('vatIncluded')}</p>
          </section>

          <section className="rounded-xl border border-line p-5">
            <h2 className="mb-3 text-xs font-bold">{t('status')}</h2>
            <p className="mb-2.5 flex flex-wrap items-center gap-2">
              <Badge tone={frozen ? 'warn' : 'accent'}>{te(`orderStatus.${order.status}`)}</Badge>
              <Badge tone="neutral">{te(`orderStage.${order.stage}`)}</Badge>
            </p>
            {/* مدّة البقاء **محسوبة** — تخزينها يجعلها تكذب بعد ساعة */}
            <p className="flex items-center gap-1.5 text-2xs opacity-55">
              {t('inStageFor')}
              {days > 0 ? (
                <Quantity unit="days" count={days} />
              ) : (
                <Quantity unit="hours" count={Math.floor(order.dwellSeconds / 3600)} />
              )}
            </p>
            {order.paymentDueAt === null || order.stage !== 'PAYMENT' ? null : (
              <p className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-md bg-warn-100 px-3 py-2 text-2xs text-warn-900">
                {t('payBy')}
                <span className="bidi-isolate font-bold">{formatted.paymentDueAt}</span>
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
