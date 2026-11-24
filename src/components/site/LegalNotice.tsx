import { Link } from '@/i18n/navigation';
import { currentUserFromCookies } from '@/lib/domain/account';
import { pendingAcceptance } from '@/lib/domain/legal';

/**
 * ═══ «وطلب قبول جديد عند أوّل فتح بعده» ═══
 *
 * نصُّ ترميز A34، وهذه الشريطةُ طرفُه. **وهي طلبٌ لا بوّابة**: الترميز
 * يقول «يُطلب»، والمنعُ شيءٌ آخر لم يُقرَّر — وشرطٌ يُفرَض بلا بابٍ
 * لاستيفائه قفلٌ بلا مفتاح.
 *
 * **وموضعُها الترويسة لا صفحةُ الحساب**: من لا يفتح حسابَه لا يعلم،
 * وهو أكثرُ الناس. والجرسُ بجوارها يقرأ الجلسةَ أصلًا، فلا تُكلّف
 * الصفحةَ تصييرًا ديناميًّا جديدًا.
 *
 * **ولا شريطةَ لمن لا جلسة له** — ولا لمن لا ينتظره شيء.
 */
export async function LegalNotice() {
  const user = await currentUserFromCookies();
  if (user === null) return null;

  const pending = await pendingAcceptance(user.id);
  if (pending.length === 0) return null;

  return (
    <div className="border-b border-warn-200 bg-warn-100 px-10 py-2.5">
      <div className="mx-auto flex w-full max-w-page flex-wrap items-center gap-x-3 gap-y-1 text-2xs">
        <span className="opacity-82">
          {/*
            ═══ وتُسمّى بأسمائها لا بعددها ═══

            «مستندان ينتظران موافقتك» يُلزم القارئَ أن يفتح ليعرف
            أيُّهما — والاسمان أقصر من رقمٍ يُفسَّر.
          */}
          نحتاج موافقتك على {pending.map((doc) => doc.titleAr).join(' و')}
        </span>
        <Link href="/account/legal" className="font-bold underline">
          اقرأ ووافق
        </Link>
      </div>
    </div>
  );
}
