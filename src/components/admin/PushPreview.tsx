import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import type { PushTemplateFit } from '@/lib/domain/push-channels';

/**
 * ═══ معاينة على الجهاز — والقاعدة تُقاس لا تُكتب ═══
 *
 * التصميم (A10) يضع معاينةً لشكل الإشعار على الجهاز، ثمّ يكتب تحتها
 * «الحدّ الآمن ٤٠ حرفًا للعنوان و١٢٠ للنص». وكانت الشاشة تكتب
 * القاعدة **ولا تقيس عليها شيئًا**.
 *
 * وقاعدةٌ مكتوبةٌ بلا قياس تُقرأ ولا تُطبَّق: لا أحد يعدّ حروف ثمانيةٍ
 * وثلاثين قالبًا بيده. فيُقتطع الإشعار على الجهاز ولا يعلم أحد — ومن
 * يقرأ «تمّت المزايدة فوقك على فورد إكسبلو…» لا يعرف أيّ مركبةٍ خسر.
 *
 * **فالمعاينة بقالبٍ حقيقيّ لا بنصٍّ مُفتعَل**: ما يُعرض هنا هو ما
 * يصل الجهاز فعلًا، والعدّ بجواره.
 */
export function PushPreview({
  template,
  titleLimit,
  bodyLimit,
}: {
  template: PushTemplateFit | null;
  titleLimit: number;
  bodyLimit: number;
}) {
  if (template === null) {
    return (
      <p className="rounded-lg border border-line bg-surface p-5 text-2xs leading-loose opacity-55">
        لا قالب دفع مفعَّل بعد.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/*
        بطاقةٌ تحاكي إشعار النظام: أيقونةٌ واسمُ تطبيق ووقت، ثمّ عنوانٌ
        ومتن. **والقصّ بالـCSS لا بالنصّ** — فما يُعرض هو النصّ كاملًا
        وما يُخفى هو ما يُخفيه الجهاز.
      */}
      <article className="rounded-xl border border-line bg-bg p-4 shadow-[0_1px_0_0_var(--color-line)]">
        <div className="mb-2 flex items-center gap-2 text-3xs opacity-50">
          <span aria-hidden className="size-4 rounded-md bg-ink/15" />
          <span className="font-body-en">CARZ</span>
          <span className="flex-1" />
          <span>الآن</span>
        </div>
        <p className="mb-1 truncate text-sm font-bold">{template.titleAr}</p>
        <p className="line-clamp-2 text-2xs leading-loose opacity-70">{template.bodyAr}</p>
      </article>

      <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-3xs">
        <Measure
          label="العنوان"
          count={template.titleChars}
          limit={titleLimit}
          over={template.titleOver}
        />
        <Measure
          label="المتن"
          count={template.bodyChars}
          limit={bodyLimit}
          over={template.bodyOver}
        />
        <span dir="ltr" className="font-num opacity-40">
          {template.key}
        </span>
      </dl>
    </div>
  );
}

/**
 * عدٌّ مقابل حدّ — **والمتجاوز يُقال شارةً لا لونًا وحده**: لونٌ بلا
 * كلمةٍ لا يُقرأ على شاشةٍ باهتة ولا يبلغ قارئ الشاشة.
 */
function Measure({
  label,
  count,
  limit,
  over,
}: {
  label: string;
  count: number;
  limit: number;
  over: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <dt className="opacity-50">{label}</dt>
      <dd className="font-num font-bold" dir="ltr">
        <ArabicNumber value={count} grouped={false} />
        <span className="opacity-40">/</span>
        <ArabicNumber value={limit} grouped={false} />
      </dd>
      {over ? <Badge tone="warn">سيُختصر</Badge> : null}
    </span>
  );
}
