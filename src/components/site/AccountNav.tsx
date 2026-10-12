import { Button } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { currentUserFromCookies } from '@/lib/domain/account';

/**
 * ═══ مدخل الحساب في الترويسة ═══
 *
 * كان يُمرَّر `actions` من كل صفحة — **ومرّرته صفحةٌ واحدة من إحدى
 * وعشرين**. فزرّ الدخول موجودٌ في الرئيسية وحدها، ومن دخل من نتيجة بحث
 * أو من رابطٍ مشارَك لا يجد إلى حسابه سبيلًا في الشاشة كلها.
 *
 * وهو الآن داخل الترويسة نفسها، فيصل كل شاشةٍ تستعملها بلا لمسها.
 *
 * ═══ ويقول الحال لا الفعل ═══
 *
 * «تسجيل الدخول» زرُّ فعلٍ لمن لا جلسة له. ومن له جلسة يريد **بابًا
 * إلى حسابه**، لا زرًّا يدعوه إلى ما هو فيه — فيرى اسمه وحرفه الأول،
 * وهو ما يؤكّد له أيضًا **بأيّ حساب** يتصفّح.
 */
export async function AccountNav({
  /**
   * داخل درج الهاتف — **فالأزرار تملأ العرض وتتكدّس**. وصفٌّ من
   * زرّين في درجٍ عرضُه ٢٨٨ يضغطهما حتى يُقصّ نصُّهما.
   */
  stacked = false,
}: { stacked?: boolean } = {}) {
  const user = await currentUserFromCookies();

  if (user === null) {
    return (
      <span className={stacked ? 'flex flex-col gap-2.5' : 'flex items-center gap-2.5'}>
        {/* الزرّ عنصر تفاعل والرابط تنقّل — لا يُخلطان */}
        <Link href="/sell" className={stacked ? 'contents' : 'hidden sm:block'}>
          <Button variant="outline" size="sm" className={stacked ? 'w-full' : ''}>
            بِع سيارتك
          </Button>
        </Link>
        <Link href="/auth" className={stacked ? 'contents' : ''}>
          <Button size="sm" className={stacked ? 'w-full' : ''}>
            تسجيل الدخول
          </Button>
        </Link>
      </span>
    );
  }

  /**
   * الاسم قد يغيب — والتسجيل بالجوال وحده، فالاسم يُطلب لاحقًا.
   * فيُعرض «حسابي» بدلًا من فراغٍ أو رقمِ جوالٍ في ترويسة.
   */
  const label = user.name ?? 'حسابي';
  const initial = (user.name ?? 'ح').trim().charAt(0);

  return (
    <span className="flex items-center gap-2.5">
      <Link href="/sell">
        <Button variant="outline" size="sm">
          بِع سيارتك
        </Button>
      </Link>

      {/*
        ═══ والاسم يُطوى على الهاتف لا يُحذف صاحبُه ═══

        صفُّ الترويسة على ٣٧٥ يطلب ٤١٣px: شعارٌ ٨٨ · «بِع سيارتك» ١٠٤ ·
        بطاقةُ الحساب ١٤٠ · زرُّ القائمة ٤٠ · وفجوتان ٣٢. فيخرج **زرُّ
        القائمة** من الشاشة — وهو أوّل ما يحتاجه زائر الهاتف.

        والاسم أوسعُ ما في الصفّ وأقلُّه لزومًا: صاحبُه يعرفه، ويقرؤه
        في الدرج وفي صفحة حسابه. فيُطوى دون ٦٤٠px وتبقى الحلقةُ
        مبلوغةً — **لا يُحذف مدخل الحساب**، فإخفاؤه يقطع الطريق إليه.
      */}
      <Link
        href="/account"
        aria-label={label}
        className="flex items-center gap-2.5 rounded-full border border-line p-1 transition-colors hover:border-accent-700 sm:py-1 sm:ps-3.5 sm:pe-1"
      >
        <span className="bidi-isolate hidden max-w-32 truncate text-sm font-semibold sm:inline">
          {label}
        </span>
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-full bg-accent-100 text-sm font-bold text-accent-700"
        >
          {initial}
        </span>
      </Link>
    </span>
  );
}
