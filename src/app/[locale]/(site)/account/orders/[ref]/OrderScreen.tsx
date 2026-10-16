'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PayPanel } from '@/components/site/PayPanel';
import { DisputePanel } from '@/components/site/DisputePanel';
import { StagePanel } from '@/components/site/StagePanel';
import { CancelOrder } from '@/components/site/CancelOrder';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { StageTracker } from '@/components/ui/StageTracker';
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge';
import { isClosedOrder, isLiveOrder } from '@/lib/domain/order-state';
import type { PublicOrder } from '@/lib/domain/orders';

/**
 * Wj — الطلب.
 *
 * **بطاقة الضمان تقول أين المال الآن**، لا «قيد المعالجة». المشتري دفع
 * ويريد أن يعرف أن مبلغه محجوز ولم يصل البائع؛ والبائع يريد أن يعرف أنه
 * محجوز فعلًا لا موعودًا.
 */
/**
 * مسارُ المستند — و`null` لما لا صفحةَ له.
 *
 * **والفاتورة الضريبية ليست منها**: رقمُها يُعرض ويكفي للمراجعة،
 * وصفحتُها مستندٌ قانونيّ بشكلٍ تُمليه الهيئة — فلا تُفتح بشكلٍ
 * نخترعه. ورابطٌ إلى صفحةٍ لا توجد أسوأ من غيابه.
 */
function docPath(kind: string): string | null {
  if (kind === 'AGREEMENT') return 'agreement';
  if (kind === 'SETTLEMENT') return 'settlement';
  return null;
}

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
    /** وقتُ كل حدث بترتيب `order.events` — الصياغة في الخادم */
    events: readonly string[];
  };
}) {
  const t = useTranslations('order');
  const te = useTranslations('enums');

  const days = Math.floor(order.dwellSeconds / 86_400);
  const frozen = order.status === 'DISPUTED';
  /** **والطلب المغلق ليس مجمَّدًا بل منتهيًا** — فلا شيء منه يُستأنف. */
  const live = isLiveOrder(order.status);

  /**
   * **الدفع للمشتري وحده وفي مرحلته وحدها**، وما دام لا حجز قائمًا.
   * و`counterparty.isSeller` تعني أن الرائي هو المشتري — الطرف الآخر بائع.
   *
   * وطلبٌ متنازَعٌ عليه لا يُدفع: الحال مجمَّدة حتى يُحسم النزاع.
   *
   * ═══ والحالة تُفحص لا المرحلة وحدها ═══
   *
   * كان الشرط `!frozen` وحده، وهو `status === 'DISPUTED'` — **فالملغى
   * والمكتمل والمتوقّف كلُّها تمرّ**. والإلغاء حالةٌ لا مرحلة: طلبٌ
   * أُلغي عند الدفع تبقى مرحلتُه `PAYMENT`، فكان الزرّ يُعرض ويعمل.
   * والحارس في الخادم (`startHold`) يرفضه الآن بـ`ORDER_CLOSED` — وهذا
   * الشرط يمنع عرضَ زرٍّ لا يصحّ أصلًا.
   */
  const canPay =
    order.counterparty.isSeller &&
    live &&
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

      {/*
        **والوسم قبل المسار.** من فتح طلبًا ملغى كان يرى مسارًا يقول
        «دفع» ولا شيء يقول إنه أُلغي حتى يقرأ أسفل الصفحة. فالحال
        تتصدّر، والمسار تحتها يقول أين توقّف.
      */}
      {live ? null : (
        <p className="mb-5 flex flex-wrap items-center gap-2.5">
          <OrderStatusBadge status={order.status} stage={order.stage} />
          {order.cancelReason === null || order.cancelReason === '' ? null : (
            <span className="text-2xs opacity-75">{order.cancelReason}</span>
          )}
        </p>
      )}

      <StageTracker current={order.stage} stopped={!live} className="mb-8" />

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
            <p className="mt-2 flex flex-wrap items-center gap-2.5 text-2xs opacity-70">
              <span className="font-num">{order.listing.ref}</span>
              <span aria-hidden className="opacity-40">·</span>
              <span>{te(`orderSource.${order.source}`)}</span>
              <span aria-hidden className="opacity-40">·</span>
              <span className="bidi-isolate">{formatted.createdAt}</span>
            </p>

            {/*
              ═══ ومن الطرف الآخر؟ ═══

              **لم يكن يُعرض قطّ.** التصميم يقول «البائع · فهد · موثّق»،
              و`counterparty.name` يُعاد من النطاق منذ بُني ولا شاشة
              تقرؤه — فيفتح المشتري طلبًا بثلاثين ألفًا ولا يعرف ممّن
              يشتري، والبائع لا يعرف لمن يبيع ولا إلى من يسلّم.

              والتوثيق معه: اسمٌ بلا صفةٍ لا يقول شيئًا عمّن أمامك.
            */}
            {order.counterparty.name === '' ? null : (
              <p className="mt-3.5 flex flex-wrap items-baseline gap-2.5 border-t border-line pt-3.5 text-2xs">
                <span className="opacity-70">
                  {order.counterparty.isSeller ? t('sellerParty') : t('buyerParty')}
                </span>
                <span className="bidi-isolate font-bold">{order.counterparty.name}</span>
                <Badge tone={order.counterparty.verified ? 'accent' : 'neutral'}>
                  {order.counterparty.verified ? t('partyVerified') : t('partyUnverified')}
                </Badge>
              </p>
            )}
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
                    {/*
                      **والمتوقَّع لا يُعنوَن خطأً.** حجبُ الفاتورة
                      لقاعدةٍ تنتظر إقرارًا — أو لصفقةٍ خارج النطاق
                      أصلًا — قرارُنا نحن لا عطلٌ في صفقة المشتري،
                      و«تعذّر» تجعله يظنّ أنّ شيئًا انكسر عنده.
                    */}
                    <p className="text-xs font-bold">
                      {event.type === 'invoice.blocked' &&
                      event.reason !== null &&
                      t.has(`docBlockedReason.${event.reason}`)
                        ? t('event.invoice.deferred')
                        : t.has(`event.${event.type}`)
                          ? t(`event.${event.type}`)
                          : t('event.other')}
                    </p>
                    {/*
                      ═══ والسببُ تحت العنوان ═══

                      «تعذّر إصدار الفاتورة» عاريةً بعد صفقةٍ **نجحت**
                      تقرأ كعطل: المال وصل البائع والملكية انتقلت، ثمّ
                      سطرٌ يقول إنّ شيئًا تعذّر ولا يقول ماذا ولا ما
                      العمل. والسببُ في الحمولة منذ كُتبت، وبطاقةُ
                      الوثائق تشرحه بالجملة نفسها — فيُقال هنا أيضًا.
                    */}
                    {event.reason === null || !t.has(`docBlockedReason.${event.reason}`) ? null : (
                      <p className="mt-1 text-3xs leading-loose opacity-75">
                        {t(`docBlockedReason.${event.reason}`)}
                      </p>
                    )}
                    {/*
                      **ومتى وقعت؟** كان المسار أربعة أسطر متطابقة تقول
                      «انتقال مرحلة» بلا وقت — و`createdAt` يُعاد لكل
                      حدث ولا يُقرأ. ومن يتابع صفقته يسأل «متى وافق
                      البائع؟» لا «هل وافق؟»، والتصميم يضع التاريخ
                      تحت كل خطوة.
                    */}
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-3xs opacity-70">
                      {event.toStage === null ? null : (
                        <span>{te(`orderStage.${event.toStage}`)}</span>
                      )}
                      {formatted.events[i] === undefined ? null : (
                        <>
                          <span aria-hidden className="opacity-40">·</span>
                          <span className="bidi-isolate">{formatted.events[i]}</span>
                        </>
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

          {/*
            الخطوة التالية — **ولم يكن للطلب ما يحرّكه**. تُعرض بعد
            الدفع: البائع يبدأ النقل، والمشتري يؤكّد الاستلام.
          */}
          {/*
            **والمغلَق لا خطوةَ له.** كانت اللوحة تُعرض لطلبٍ ملغى
            فتقول «بعد أن يُحجز مبلغك ينتقل الطلب إلى نقل الملكية» —
            وعدٌ بخطوةٍ لن تأتي. والحدُّ `isClosedOrder` هو نفسه الذي
            يفرضه `openDispute`، فلا تُخفى عن المتوقّف بابٌ يفتحه له
            الخادم.
          */}
          {canPay || isClosedOrder(order.status) ? null : (
            <div className="mb-3.5">
              <StagePanel
                orderRef={order.ref}
                stage={order.stage}
                viewerIsBuyer={order.counterparty.isSeller}
                frozen={frozen}
              />
              {/*
                والنزاع تحتها — آخر الحلول لا أوّلها. وللمشتري وحده،
                بعد الدفع: قبله لا نزاع بل إلغاء.
              */}
              <DisputePanel
                orderRef={order.ref}
                canOpen={
                  order.counterparty.isSeller &&
                  !frozen &&
                  order.stage !== 'PAYMENT' &&
                  order.stage !== 'REQUEST' &&
                  order.stage !== 'APPROVED' &&
                  order.stage !== 'INSPECTION'
                }
                hasOpen={order.dispute !== null}
              />

              {/*
                ═══ والإلغاء آخر الصفّ ═══

                **ولا يُعرض بعد الإفراج**: نُقلت الملكية ووصل المال
                البائع، فالمسار نزاعٌ لا إلغاء — وزرٌّ يردّ ٤٠٩ بعد
                الضغط أسوأ من غيابه.

                وهو **لكلا الطرفين**: البائع قد يعتذر كما ينسحب
                المشتري، وحصرُه في أحدهما يترك الآخر يتّصل بالدعم.
              */}
              {order.escrow?.status === 'RELEASED' || order.stage === 'DONE' ? null : (
                <p className="mt-1 text-center">
                  <CancelOrder
                    orderRef={order.ref}
                    paid={order.escrow !== null && order.escrow.status === 'HELD'}
                  />
                </p>
              )}
            </div>
          )}

          {order.escrow === null ? null : (
            <section className="mb-3.5 rounded-xl border-2 border-ink p-5">
              <h2 className="mb-1.5 text-sm font-bold">{t('escrow')}</h2>
              <p className="mb-3.5 text-2xs leading-loose opacity-75">
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
                <span className="opacity-70">{t(key)}</span>
                <ArabicNumber value={Number(value)} className="font-bold" />
              </div>
            ))}
            {/*
              ═══ وعربون المزاد سطرٌ ظاهر ═══

              حُجز على بطاقته عند أوّل مزايدة، وخُصم من المطلوب.
              **وبلا هذا السطر يقرأ المشتري إجماليًّا لا يُجمَع**: سعرٌ
              ورسمٌ ثم مطلوبٌ أقلّ منهما، فيظنّ الحساب مختلًّا.
            */}
            {Number(order.amounts.depositApplied ?? 0) === 0 ? null : (
              <div className="flex items-center justify-between gap-4 py-1.5 text-sm text-accent-700">
                <span>عربون المزاد (محجوز سلفًا)</span>
                <span className="font-bold">
                  −<ArabicNumber value={Number(order.amounts.depositApplied)} />
                </span>
              </div>
            )}

            <div className="mt-2 flex items-center justify-between gap-4 border-t border-line pt-3 text-base font-bold">
              <span>{Number(order.amounts.depositApplied ?? 0) === 0 ? t('total') : 'المطلوب الآن'}</span>
              <ArabicNumber value={Number(order.amounts.total)} />
            </div>
            <p className="mt-2 text-3xs opacity-65">{t('vatIncluded')}</p>
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
                    <span className="opacity-70">{t('settlementRow.vehicleValue')}</span>
                    <ArabicNumber
                      value={Number(order.settlement.vehicleValue)}
                      className="font-bold"
                    />
                  </div>
                  {deductions.map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between gap-4 py-1 text-2xs">
                      <span className="opacity-70">{t(`settlementRow.${key}`)}</span>
                      <ArabicNumber value={-Number(value)} className="font-bold" />
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-3xs leading-loose opacity-70">
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
            <p className="mb-3 text-3xs opacity-70">{t('documentsNote')}</p>
            <ul className="flex flex-col gap-2.5">
              {order.documents.map((doc, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                      doc.state === 'READY'
                        ? 'bg-accent'
                        : doc.state === 'BLOCKED'
                          ? 'bg-warn-700'
                          : 'bg-line'
                    }`}
                  />
                  <div className={`min-w-0 ${doc.state === 'READY' ? '' : 'opacity-65'}`}>
                    <p className="text-2xs font-bold">
                      {t(`docKind.${doc.kind}`)}
                      {doc.supplyType === undefined ? null : (
                        <span className="font-normal opacity-70">
                          {' '}
                          {t(`docSupply.${doc.supplyType}`)}
                        </span>
                      )}
                    </p>
                    {doc.availableAt === null ? null : (
                      <p className="mt-0.5 text-3xs">{t(`docAt.${doc.availableAt}`)}</p>
                    )}
                    {/*
                      ═══ وما لم يصدر يُقال لماذا ═══

                      **الوعد لا يبقى بعد موعده.** كان السطر يقول
                      «يصدر عند الإفراج عن المبلغ» بعد أن أُفرج —
                      فينتظر المشتري فاتورةً لن تأتي ولا يعرف أنه
                      ينتظر. والسبب مكتوبٌ عندنا منذ وقع، يقرؤه
                      الأدمن ولا يقرؤه صاحب الطلب.
                    */}
                    {doc.state !== 'BLOCKED' ? null : (
                      <p className="mt-0.5 text-3xs leading-loose">
                        {t('docBlocked')}
                        {' — '}
                        {t(
                          `docBlockedReason.${
                            doc.blockedReason !== undefined &&
                            t.has(`docBlockedReason.${doc.blockedReason}`)
                              ? doc.blockedReason
                              : 'other'
                          }`,
                        )}
                      </p>
                    )}
                    {doc.kind !== 'INVOICE' || doc.reference === null ? null : (
                      <p className="mt-0.5 flex items-center gap-1.5 text-3xs opacity-70">
                        {t('docNumber')}
                        {/* الرقم يُنسخ ويُقارن خانةً بخانة — لاتينيّ ومعزول */}
                        <span dir="ltr" className="bidi-isolate font-num">
                          {doc.reference}
                        </span>
                      </p>
                    )}

                    {/*
                      ═══ والمعروضُ يُفتح ═══

                      كانت القائمة نهايةَ الطريق: «عقد البيع ✓» وبلا
                      رابط. ومن اشترى بسبعين ألفًا يحتاج عقده في
                      المرور، والبائعُ يحتاج كشفه ليعرف لماذا وصله
                      هذا المبلغ بالذات.
                    */}
                    {doc.state !== 'READY' || docPath(doc.kind) === null ? null : (
                      <Link
                        href={`/${locale}/account/orders/${encodeURIComponent(order.ref)}/documents/${String(docPath(doc.kind))}`}
                        className="mt-1 inline-block text-3xs font-bold underline underline-offset-4"
                      >
                        {t('openDocument')}
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-line p-5">
            <h2 className="mb-3 text-xs font-bold">{t('status')}</h2>
            {/*
              ═══ وسمٌ واحد لا وسمان يتناقضان ═══

              كان هنا وسمان: `orderStatus` بلون `accent` و`orderStage`
              بلون `neutral`. فطلبٌ ملغى يُقرأ **«ملغى» بالأخضر
              وبجانبه «دفع»** — جملتان في سطرٍ واحد تنفي كلٌّ منهما
              الأخرى، والأولى بلونِ نجاح.
              والقرار ١٧ يحسمها: «أُلغي عند الدفع» قراءةً واحدة.
            */}
            <p className="mb-2.5 flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={order.status} stage={order.stage} />
            </p>
            {/*
              مدّة البقاء **محسوبة** — تخزينها يجعلها تكذب بعد ساعة.
              **ولا تُقال لطلبٍ مغلق**: «في هذه المرحلة منذ ثلاثة أيّام»
              تقول إنه فيها الآن وينتظر — والوسمُ أعلاه قال إنه انتهى.
            */}
            {isClosedOrder(order.status) ? null : (
            <p className="flex items-center gap-1.5 text-2xs opacity-70">
              {t('inStageFor')}
              {/*
                **وأقلُّ من ساعةٍ تُقال بجملتها.** `Quantity` تصوغ الصفر
                «لا ساعات»، فيقرأ صاحب الطلب «في هذه المرحلة منذ لا ساعات»
                — وهي جملةٌ لا معنى لها في أوّل ساعةٍ من كل طلب، أي في
                اللحظة التي يفتح فيها الشاشة أوّل مرّة.
              */}
              {days > 0 ? (
                <Quantity unit="days" count={days} />
              ) : order.dwellSeconds < 3600 ? (
                <span>{t('lessThanAnHour')}</span>
              ) : (
                <Quantity unit="hours" count={Math.floor(order.dwellSeconds / 3600)} />
              )}
            </p>
            )}
            {/*
              **و«ادفع قبل ‹تاريخ›» وعدٌ لا وصف.** كان الشرط على
              المرحلة وحدها، فيُعرض صندوقٌ أوكرُ بمهلةِ دفعٍ على طلبٍ
              أُلغي — يُطالب صاحبَه بدفعٍ لا يُقبل منه، والخادم يردّه
              بـ`ORDER_CLOSED`.
            */}
            {order.paymentDueAt === null || !live || order.stage !== 'PAYMENT' ? null : (
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
