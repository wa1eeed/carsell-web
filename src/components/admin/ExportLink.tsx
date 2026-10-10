import { REPORT_NAME } from '@/lib/labels/reports';

/**
 * ═══ تصدير القائمة — من مكانها لا من شاشةٍ أخرى ═══
 *
 * التصميم يضع «تصدير CSV» في ترويسة كل قائمة، والمبنيّ يجمعها كلّها
 * في «التقارير والتصدير». وشاشةٌ جامعة صحيحةٌ للمراجعة الدورية،
 * **لكن من يقف على طابورٍ مرشَّح يريد تصديره الآن** — لا أن يحفظ ما
 * رشّحه ويذهب إلى شاشةٍ ثانية ليُعيده.
 *
 * ═══ ولا يُصدَّر ما يُعرض ═══
 *
 * الرابط يذهب إلى التقرير المُعرَّف في `report-catalog` — استعلامٌ
 * مسمّى بأعمدةٍ مقرَّرة وحدِّ صفوفٍ وصلاحيةٍ خاصّة به. **ولا يُصدَّر
 * ما تعرضه الشاشة**: المعروض مقتطعٌ ومرشَّح لغرض النظر، والمصدَّر
 * يُفتح في جدولٍ ويُبنى عليه قرار.
 *
 * وصلاحية التصدير قد تكون أضيق: من يرى العملاء في الشاشة ليس بالضرورة
 * من يُخرجهم ملفًّا من المنصّة ولا يعود.
 */
export function ExportLink({ reportKey, allowed }: { reportKey: string; allowed: boolean }) {
  // لا يُعرض لمن لا يملكه — وزرٌّ يردّ ٤٠٣ بعد الضغط أسوأ من غيابه
  if (!allowed) return null;

  return (
    <a
      href={`/api/v1/admin/exports/${reportKey}`}
      className="flex items-center gap-1.75 rounded-btn border border-line px-3.5 py-2.25 text-3xs font-bold hover:border-ink"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3v12" />
        <path d="m7 11 5 5 5-5" />
        <path d="M4 20h16" />
      </svg>
      تصدير {REPORT_NAME[reportKey as keyof typeof REPORT_NAME] ?? reportKey}
    </a>
  );
}
