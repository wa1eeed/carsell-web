'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PayPanel } from '@/components/site/PayPanel';
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
  locale,
}: {
  order: PublicOrder;
  locale: string;
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

  /**
   * **الدفع للمشتري وحده وفي مرحلته وحدها**، وما دام لا حجز قائمًا.
   * و`counterparty.isSeller` تعني أن الرائي هو المشتري — الطرف الآخر بائع.
   *
   * وطلبٌ متنازَعٌ عليه لا يُدفع: الحال مجمَّدة حتى يُحسم النزاع.
   */
  const canPay =
    order.counterparty.isSeller &&
    order.stage === 'PAYMENT' &&
    order.escrow === null &&
    !frozen;

  const deductions = (
    [
      ['commission', order.settlement?.commission ?? '0'],
      ['gatewayFee', order.settlement?.gatewayFee ?? '0'],
    ] as const
  ).filter(([, value]) => Number(value) > 0);

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
                    {/*
                      المفتاح مشتقّ من قيمة في قاعدة البيانات، فقد يصل نوعٌ
                      لا ترجمة له — و`t` حينها **يطبع مسار المفتاح نفسه**
                      أمام المستخدم. الاحتياط هنا لا يخفي النقص: المرحلة
                      تحته تبقى ظاهرة، والاختبار يمنع النوع غير المترجَم.
                    */}
                    <p className="text-xs font-bold">
                      {t.has(`event.${event.type}`) ? t(`event.${event.type}`) : t('event.other')}
                    </p>
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
          {!canPay ? null : (
            <div className="mb-3.5">
              <PayPanel orderRef={order.ref} total={order.amounts.total} locale={locale} />
            </div>
          )}

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
            {/*
              الرسمان **سطران دائمًا**: الأوّل حكوميّ يُمرَّر كما هو، والثاني
              إيرادٌ لنا تسري عليه الضريبة. ودمجُهما في سطر «رسوم النقل ٤٠٠»
              يجعل المبلغ كلّه توريدًا منّا — وهو خطأ تصنيفٍ لا خطأ عرض.
            */}
            {(
              [
                ['price', order.amounts.agreedPrice],
                ['commission', order.amounts.commission],
                ['transferFee', order.amounts.transferFee],
                ['adminFee', order.amounts.transferAdminFee],
              ] as const
            )
              .filter(([key, value]) => key !== 'adminFee' || Number(value) > 0)
              .map(([key, value]) => (
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

          {/*
            ═══ الصافي يُرى **قبل** الإفراج لا بعده ═══

            كشفٌ يظهر بعد تحرّك المال يشرح ما وقع، وكشفٌ يظهر قبله يجعل
            البائع يعترض وهو ما زال ممكنًا. والتقدير معلَنٌ تقديرًا: لا
            يُعرض رقمٌ مؤقّت بهيئة رقمٍ نهائيّ.
          */}
          {order.settlement === null ? null : (
            <section
              className={`mb-3.5 rounded-xl p-5 ${
                order.settlement.preview ? 'border border-dashed border-line' : 'border border-line'
              }`}
            >
              <h2 className="mb-1.5 text-xs font-bold">{t('settlementTitle')}</h2>
              <Money amount={Number(order.settlement.netToSeller)} size="lg" />
              {/*
                **الخصم الصفريّ لا يُعرض.** «رسوم بوابة الدفع −٠» قبل
                اختيار البوابة تقول «لا رسوم» وصوابها «لم تُعرف بعد» —
                وصفرٌ معناه مجهول أسوأ من سطرٍ غائب. والعمولة ٠٪ مذكورة
                في بطاقة المبالغ فوقها، فتكرارها هنا ضجيج.
              */}
              {deductions.length === 0 ? null : (
                <div className="mt-3.5 border-t border-line pt-3">
                  <div className="flex items-center justify-between gap-4 py-1 text-2xs">
                    <span className="opacity-60">{t('settlementRow.vehicleValue')}</span>
                    <ArabicNumber
                      value={Number(order.settlement.vehicleValue)}
                      className="font-bold"
                    />
                  </div>
                  {deductions.map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between gap-4 py-1 text-2xs">
                      <span className="opacity-60">{t(`settlementRow.${key}`)}</span>
                      <ArabicNumber value={-Number(value)} className="font-bold" />
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-3xs leading-loose opacity-50">
                {order.settlement.preview ? t('settlementPreview') : t('settlementNotInvoice')}
              </p>
            </section>
          )}

          {/*
            ═══ القادم يُعرض بموعده ═══

            وقسمٌ فارغ يجعل صاحب الطلب يظنّ أن مستندًا ضاع. فـ«عقد البيع —
            يصدر عند تأكيد النقل» أوضح من غيابه، والتذكير يسبق لحظة الحاجة.
          */}
          <section className="mb-3.5 rounded-xl border border-line p-5">
            <h2 className="mb-1 text-xs font-bold">{t('documents')}</h2>
            <p className="mb-3 text-3xs opacity-50">{t('documentsNote')}</p>
            <ul className="flex flex-col gap-2.5">
              {order.documents.map((doc, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                      doc.state === 'READY' ? 'bg-accent' : 'bg-line'
                    }`}
                  />
                  <div className={`min-w-0 ${doc.state === 'READY' ? '' : 'opacity-45'}`}>
                    <p className="text-2xs font-bold">
                      {t(`docKind.${doc.kind}`)}
                      {doc.supplyType === undefined ? null : (
                        <span className="font-normal opacity-60">
                          {' '}
                          {t(`docSupply.${doc.supplyType}`)}
                        </span>
                      )}
                    </p>
                    {doc.availableAt === null ? null : (
                      <p className="mt-0.5 text-3xs">{t(`docAt.${doc.availableAt}`)}</p>
                    )}
                    {doc.kind !== 'INVOICE' || doc.reference === null ? null : (
                      <p className="mt-0.5 flex items-center gap-1.5 text-3xs opacity-60">
                        {t('docNumber')}
                        {/* الرقم يُنسخ ويُقارن خانةً بخانة — لاتينيّ ومعزول */}
                        <span dir="ltr" className="bidi-isolate font-num">
                          {doc.reference}
                        </span>
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
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
