import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { runJobs } from '../src/lib/jobs/run';

afterAll(async () => {
  await db.$disconnect();
});

describe('الوظائف الزمنية تعمل فعلًا', () => {
  /**
   * **كل قاعدة وقتٍ في المنتج كانت معطَّلة**: الدوالّ مبنيّة ومختبَرة
   * ولا شيء يستدعي واحدة منها. فهذا الاختبار يحرس الوصل نفسه لا منطق
   * كل وظيفة — لها اختباراتها.
   */
  it('تُشغَّل كلها وتُعيد نتيجة كل واحدة', async () => {
    const run = await runJobs(new Date('2026-08-03T03:00:00.000Z'));

    expect(run.outcomes.map((outcome) => outcome.job)).toEqual([
      'expireOffers',
      'timeoutUnpaidOrders',
      // **يُفتح قبل أن يُغلق** — ومزادٌ نافذتُه دقائق يمرّ بالحالتين في تشغيلٍ واحد
      'openScheduledAuctions',
      'closeEndedAuctions',
      'expireSellerDecisions',
      'overdueTransfers',
      'overdueDisputes',
      'releaseConfirmedOrders',
    ]);
    expect(run.failed).toBe(0);
    for (const outcome of run.outcomes) expect(outcome.ok).toBe(true);
  });

  /**
   * **وواحدةٌ لا تُسقط الباقي.** فشلُ المطابقة لأن بوابةً لا تردّ يجب
   * ألّا يمنع انتهاء العروض — وتشغيلٌ يتوقّف عند أوّل عثرة يترك نصف
   * القواعد بلا تنفيذ، والنصف الباقي لا يُعرف أنه لم يُنفَّذ.
   */
  it('السقوط يُلتقط ويُسمّى ولا يُوقف الجملة', async () => {
    const run = await runJobs(new Date('2026-08-03T03:00:00.000Z'), [
      { name: 'first', run: () => Promise.resolve(3) },
      { name: 'broken', run: () => Promise.reject(new Error('gateway did not answer')) },
      { name: 'third', run: () => Promise.resolve(1) },
    ]);

    expect(run.failed).toBe(1);
    expect(run.outcomes.map((outcome) => outcome.job)).toEqual(['first', 'broken', 'third']);

    // الجارتان عملتا — والساقطة تُسمّى برسالتها لا بـ«فشل التشغيل»
    const [first, broken, third] = run.outcomes;
    expect(first?.ok === true && first.affected).toBe(3);
    expect(third?.ok === true && third.affected).toBe(1);
    expect(broken?.ok === false && broken.error).toBe('gateway did not answer');
  });
});
