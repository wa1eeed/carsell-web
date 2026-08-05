import { closeEndedAuctions,
  openScheduledAuctions, expireSellerDecisions } from '@/lib/domain/auctions';
import { expireOffers, timeoutUnpaidOrders } from '@/lib/domain/offers';
import { overdueTransfers } from '@/lib/domain/transfer-windows';
import { overdueDisputes } from '@/lib/domain/disputes';
import { settleableOrders } from '@/lib/domain/transfer-windows';
import { settleOnTransferConfirmed } from '@/lib/domain/payments';

/**
 * ═══ الوظائف الزمنية — والمهلة التي لا تُنفَّذ ليست مهلة ═══
 *
 * كل قاعدة وقتٍ في المنتج كانت **معطَّلة**: `expireOffers` و
 * `timeoutUnpaidOrders` و`closeEndedAuctions` وأخواتها مبنيّة ومختبَرة،
 * **ولا شيء يستدعي واحدة منها**. فالعرض لا يسقط بعد مهلته، والطلب غير
 * المدفوع يحبس سيارةً إلى الأبد، والمزاد لا يُغلق ولا يرسو على أحد.
 *
 * والشاشة تعرض «مهلة الدفع حتى ٤ أغسطس» — وعدٌ لا يقع.
 *
 * ═══ وواحدةٌ لا تُسقط الباقي ═══
 *
 * كل وظيفة تُغلَّف على حدة: فشلُ المطابقة لأن بوابةً لا تردّ يجب ألّا
 * يمنع انتهاء العروض. والنتيجة تُجمع وتُعاد كاملةً — من يقرأ التقرير
 * يحتاج أن يعرف **أيّها فشل** لا أن الجملة فشلت.
 */

export type JobOutcome =
  | { job: string; ok: true; affected: number; ms: number }
  | { job: string; ok: false; error: string; ms: number };

export type JobRun = {
  startedAt: string;
  ms: number;
  outcomes: JobOutcome[];
  failed: number;
};

export type Job = { name: string; run: (now: Date) => Promise<number> };

/**
 * الترتيب مقصود: **ما يُحرّر أوّلًا**.
 *
 * انتهاء العروض وإسقاط الطلبات غير المدفوعة يُعيدان إعلانات إلى العرض،
 * وإغلاق المزادات يُنشئ طلبات — فتشغيلُها قبل التنبيهات يجعل التنبيه
 * على حالٍ صحيحة لا على حالٍ قديمة بلحظة.
 */
const JOBS: readonly Job[] = [
  { name: 'expireOffers', run: (now) => expireOffers(now) },
  { name: 'timeoutUnpaidOrders', run: (now) => timeoutUnpaidOrders(now) },
  // **يُفتح قبل أن يُغلق** — وترتيبُهما يعني أن مزادًا نافذتُه دقائق يُفتح ويُغلق في تشغيلٍ واحد
  { name: 'openScheduledAuctions', run: (now) => openScheduledAuctions(now) },
  { name: 'closeEndedAuctions', run: (now) => closeEndedAuctions(now) },
  { name: 'expireSellerDecisions', run: (now) => expireSellerDecisions(now) },
  { name: 'overdueTransfers', run: async (now) => (await overdueTransfers(now)).length },
  { name: 'overdueDisputes', run: async (now) => (await overdueDisputes(now)).length },
  /**
   * **شبكة أمانٍ لا مسارٌ ثانٍ.** الإفراج يقع لحظة تأكيد نقل الملكية،
   * وهذه تلتقط ما تعثّر: بوابةٌ لم تردّ، أو حاويةٌ سقطت بين التأكيد
   * والنداء. ولولاها بقي مال البائع محجوزًا بلا ما يقول إن النداء
   * لم يقع — والصمت هنا لا يُكتشف إلا حين يسأل البائع.
   */
  { name: 'releaseConfirmedOrders', run: (now) => releaseConfirmedOrders(now) },
];

/**
 * يُفرج عن كل طلبٍ نُقلت ملكيته ومالُه محجوز.
 *
 * **واحدًا واحدًا باستدعاءٍ مفرد** — والقائمة تُقرأ في `settleableOrders`
 * وهي لا تكتب. فدالّةٌ تمرّ على مجموعةٍ تلمس مالًا وتكتب هي الشكل الذي
 * يُفرِج عن مئة مبلغ بخطأ سطر.
 *
 * وفشلُ واحدٍ لا يوقف الباقين: بوابةٌ ترفض حجزًا بعينه لا تحبس مال
 * تسعةٍ غيره.
 */
async function releaseConfirmedOrders(now: Date): Promise<number> {
  const refs = await settleableOrders();
  let released = 0;

  for (const ref of refs) {
    const result = await settleOnTransferConfirmed(ref, now).catch(() => null);
    if (result?.ok === true) released += 1;
  }
  return released;
}

/**
 * `jobs` مَحقنٌ للاختبار — كما يُحقَن `Fetcher` في مُهايئ البوابة.
 * وبلا هذا الشقّ لا يُختبَر «واحدةٌ تسقط ولا تُسقط الباقي» إلا بإسقاط
 * وظيفةٍ حقيقية، وهو اختبارٌ يقيس المنطق لا الوصل.
 */
export async function runJobs(
  now: Date = new Date(),
  jobs: readonly Job[] = JOBS,
): Promise<JobRun> {
  const startedAt = Number.isNaN(now.getTime()) ? new Date().toISOString() : now.toISOString();
  const began = Date.now();
  const outcomes: JobOutcome[] = [];

  for (const job of jobs) {
    const at = Date.now();
    try {
      const affected = await job.run(now);
      outcomes.push({ job: job.name, ok: true, affected, ms: Date.now() - at });
    } catch (caught) {
      /**
       * الرسالة تُلتقط ولا تُرمى: **وظيفةٌ تسقط لا تُسقط جارتها**،
       * والتقرير يقول أيّها سقط بدل أن يقول «فشل التشغيل».
       */
      outcomes.push({
        job: job.name,
        ok: false,
        error: caught instanceof Error ? caught.message : 'unknown error',
        ms: Date.now() - at,
      });
    }
  }

  return {
    startedAt,
    ms: Date.now() - began,
    outcomes,
    failed: outcomes.filter((outcome) => !outcome.ok).length,
  };
}
