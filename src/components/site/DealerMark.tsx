/**
 * علامةُ المعرض في الشبكة — شعارُه أو حرفُ اسمه.
 *
 * **والشبكة تُقرأ بالصورة قبل الاسم.** فهرسٌ من ثماني بطاقاتٍ نصّية
 * يُسقط كلّ تمييزٍ بينها، فيصير الاختيار قراءةً لا لمحة.
 *
 * **والبديل حرفٌ لا فراغ**: معرضٌ بلا شعار يترك ثقبًا في الشبكة
 * يُقرأ عطلَ تحميل، والحرفُ يُبقي الإيقاع ويبقى مرساةً بصرية.
 */
export function DealerMark({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl !== null && logoUrl !== '') {
    return (
      /*
        `<img>` لا `next/image`: الشعار يأتي من تخزينٍ خارجيّ بمقاسٍ
        غير معروف، و`next/image` يحتاج أبعادًا أو مُحمِّلًا مضبوطًا —
        والنمط نفسه في `Gallery`.
      */
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={logoUrl}
        alt=""
        loading="lazy"
        className="size-11 shrink-0 rounded-lg border border-line bg-bg object-contain"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-bg text-base font-bold opacity-65"
    >
      {name.trim().charAt(0)}
    </span>
  );
}
