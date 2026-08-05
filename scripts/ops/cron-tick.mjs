/**
 * ═══ نبضة المُجدوِل — تُشغَّل داخل الحاوية ═══
 *
 * **ولا تستعمل `curl`.** صورة التشغيل `node:22-alpine` بلا أيّ
 * `apk add`، فليس فيها `curl` أصلًا — وأمرٌ يبدأ به يسقط بـ
 * «curl: not found»، فيقول المُجدوِل «failed» ولا يذكر السبب.
 * والوثيقة كانت تُملي `curl`، والـDockerfile نفسه يعرف ذلك: فحص
 * الصحّة فيه يستعمل `wget` من busybox ويكتب أنه المتاح.
 *
 * **و`wget` من busybox لا يُعوَّل عليه هنا**: دعمُ `--post-data`
 * يختلف بين البُنى، وطلبُنا `POST` بترويسة تفويض. و`node` موجودٌ
 * يقينًا — هو الذي يشغّل الخادم.
 *
 * ═══ وتنادي المنفذ المحلّي لا العنوان العامّ ═══
 *
 * الحاوية تنادي نفسها: بلا خروجٍ إلى الإنترنت، وبلا TLS، وبلا اعتمادٍ
 * على أن يكون النطاق قد صار جاهزًا. ونداءُ العنوان العامّ من الداخل
 * يفشل في إعداداتٍ كثيرة بلا سببٍ ظاهر.
 *
 * الاستعمال في Coolify (كل ٥ دقائق):
 *   node scripts/ops/cron-tick.mjs
 */

const secret = process.env.CRON_SECRET;
const port = process.env.PORT ?? '3000';
const url = `http://127.0.0.1:${port}/api/cron/run`;

/**
 * **والسرّ الغائب يُقال صراحةً.** بدونه يردّ المسار ٥٠٣ ولا يشتغل،
 * ورسالةٌ عامّة تجعل الناشر يبحث في الشيفرة عن عطلٍ ليس فيها.
 */
if (secret === undefined || secret === '') {
  console.error('✗ CRON_SECRET غير مضبوط في متغيّرات البيئة — المسار يردّ ٥٠٣ ولا يشتغل.');
  process.exit(1);
}

const response = await fetch(url, {
  method: 'POST',
  headers: { authorization: `Bearer ${secret}` },
}).catch((error) => {
  console.error(`✗ تعذّر الوصول إلى ${url} — ${String(error)}`);
  return null;
});

if (response === null) process.exit(1);

const body = await response.text().catch(() => '');

/**
 * **ويُطبع الجسد دائمًا.** المُجدوِل يعرض المخرَج، فحين يفشل تشغيلٌ
 * يرى الناشر أيّ وظيفةٍ سقطت بدل كلمة «failed» وحدها.
 */
console.log(`${String(response.status)} ${body}`);

// ٥٠٠ حين تسقط وظيفة — والخروج غير الصفريّ هو ما يُنبّه المُجدوِل
process.exit(response.ok ? 0 : 1);
