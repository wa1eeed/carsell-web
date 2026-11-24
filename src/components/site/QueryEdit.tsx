'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

/**
 * ═══ «عدّل الجملة» — ولم يكن لها باب ═══
 *
 * شريطُ الفهم يقتبس جملةَ الباحث بين قوسين («كامري مستعملة في الرياض»)
 * ويعرض ما فُهم منها — **ولا سبيل إلى تغييرها**. وصندوقُ البحث في
 * الرئيسية وحدها (`HeroSearch`)، فمن وصل إلى النتائج برابطٍ أو من
 * محرّك بحث **لا يجد في الشاشة كلِّها حقلًا يكتب فيه**: يرجع إلى
 * الرئيسية، أو يحرّر العنوان بيده.
 *
 * وترميز `Wb` يضع الزرّ في موضعه: بجوار الجملة المقتبسة.
 *
 * ═══ والفلاتر اليدوية تبقى ═══
 *
 * الجملةُ أحدُ مصادر الترشيح لا كلُّه: من كتب جملةً ثمّ ضغط «مزاد»
 * وعدّل جملته لا يقصد إلغاء المزاد. فيُبدَّل `q` وحده، **ويُصفَّر
 * `page`** — فالصفحةُ الثالثة من بحثٍ آخر قد لا توجد.
 */
export function QueryEdit({ text, label, apply }: { text: string; label: string; apply: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(text);

  const submit = (): void => {
    const next = new URLSearchParams(params.toString());
    const clean = value.trim();
    if (clean === '') next.delete('q');
    else next.set('q', clean);
    next.delete('page');
    setOpen(false);
    router.push(`?${next.toString()}`, { scroll: false });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(text);
          setOpen(true);
        }}
        className="shrink-0 text-3xs font-bold text-accent-800 underline underline-offset-4 hover:opacity-75"
      >
        {label}
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex min-w-0 flex-1 items-center gap-2"
    >
      {/*
        **والحقلُ يبدأ بما هو مكتوب** — فمن أراد تصحيح كلمةٍ لا يُعيد
        كتابة جملته. والتركيزُ عليه عند الفتح، فالزرُّ وُجد ليُكتب بعده.
      */}
      <input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        className="min-w-0 flex-1 rounded-lg border border-accent bg-bg px-3 py-2 text-2xs outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg bg-ink px-3 py-2 text-3xs font-bold text-bg"
      >
        {apply}
      </button>
    </form>
  );
}
