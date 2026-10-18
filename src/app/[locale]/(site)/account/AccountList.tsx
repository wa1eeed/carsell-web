import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';

/**
 * ═══ قائمة حسابٍ واحدة، تخدم أربع شاشات ═══
 *
 * **الأربع كانت ٤٠٤** والحساب يربط إليها بعدّاداتها: الطلبات
 * والمركبات والمفضّلة والتقارير. والبيانات كانت جاهزة في
 * `getAccountData` منذ بنائها — الشاشة وحدها ناقصة، فيقرأ المستخدم
 * «طلباتي ٣» ويضغط فيصل إلى لا شيء.
 *
 * وهي **قالبٌ واحد** لأن الأربع بنيةٌ واحدة: عنوانٌ وعودةٌ وقائمةٌ
 * أو حالةُ فراغ. ونسخُها أربع مرّات يُنتج أربع صفحاتٍ تتباعد أوّل تعديل.
 */
export function AccountList({
  locale,
  title,
  crumb,
  subtitle,
  stats,
  notice,
  filters,
  empty,
  action,
  children,
}: {
  locale: string;
  title: string;
  /**
   * اسم الصفحة في المسار حين يخالف عنوانها — **والمسارُ موضعٌ
   * والعنوانُ وصف**. التصميم يكتب «حسابي › تقاريري» والعنوان «تقارير
   * الفحص»: الأوّل يقول أين أنت من حسابك، والثاني ماذا في الصفحة.
   */
  crumb?: string;
  subtitle: string;
  /**
   * صفُّ أرقامٍ تحت الترويسة — كما في ترميز Wt.
   *
   * **ويُعرض ولو خلت الصفحة**: «صفر مشاهدة» على بائعٍ لم ينشر بعد
   * جوابٌ، وإخفاؤه يجعل الرقم يظهر فجأةً فيبدو أنه بُني الآن.
   */
  stats?: ReactNode;
  /**
   * بشارةُ ما وقع لتوّه — «حُفظت سيارتك».
   *
   * **وموضعُها فوق الترشيح**: من عاد من حفظٍ ناجح يقرأ النتيجة قبل
   * أن يبحث عن صفّه، ولا يُزاحمها شريطُ تبويبات.
   */
  notice?: ReactNode;
  /**
   * صفُّ ترشيحٍ بين الترويسة والقائمة.
   *
   * **وموضعُه فوق الحالة الفارغة لا تحتها**: من رشّح إلى مجموعةٍ خالية
   * يجب أن يبقى أمامه ما يعيده إلى غيرها — وإلّا صار «لا طلبات ملغاة»
   * بابًا مغلقًا لا مخرجَ منه إلّا الرجوع.
   */
  filters?: ReactNode;
  empty: { title: string; description: string };
  /** زرّ الحالة الفارغة — «بِع سيارتك» أو «تصفّح» */
  action?: ReactNode;
  children: ReactNode[];
}) {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-3xl px-10 py-10">
          {/*
            ═══ مسارُ تنقّلٍ لا سهمُ رجوع ═══

            كان «← حسابي» وحده، والتصميم يكتب «حسابي › إعلاناتي».
            **والفرق أن الأوّل يقول إلى أين تعود، والثاني يقول أين
            أنت** — ومن يصل من نتيجة بحثٍ أو رابطٍ منسوخ لا يعرف
            موضعَه من الشجرة إلّا منه.
          */}
          <Breadcrumb
            label="مسار التنقل"
            separator="›"
            className="mb-6"
            items={[
              { label: 'حسابي', href: `/${locale}/account` },
              { label: crumb ?? title },
            ]}
          />

          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="mb-1.5 text-3xl font-bold tracking-tight">{title}</h1>
              <p className="text-sm opacity-70">{subtitle}</p>
            </div>
            {/*
              **وفعلُ الصفحة في ترويستها لا في فراغها وحده.** كان
              يُعرض داخل الحالة الفارغة فقط — فمن عنده مركبتان لا يجد
              «أضف مركبة» إلّا بالعودة إلى الرئيسية.
            */}
            {action === undefined ? null : <div className="shrink-0">{action}</div>}
          </div>

          {stats === undefined ? null : <div className="mb-7">{stats}</div>}

          {notice === undefined ? null : <div className="mb-6">{notice}</div>}

          {filters === undefined ? null : <div className="mb-6">{filters}</div>}

          {children.length === 0 ? (
            <EmptyState title={empty.title} description={empty.description} />
          ) : (
            <div className="flex flex-col gap-2.5">{children}</div>
          )}
        </div>
      </main>
    </>
  );
}

/**
 * صفٌّ واحد: عنوانٌ وسنة، وسطرُ تفاصيل، وقيمةٌ في الطرف.
 * و`href === null` يعني صفًّا لا يُفتح — التقرير الذي سُحب إعلانه.
 */
export function AccountRow({
  href,
  title,
  year,
  meta,
  value,
  badge,
}: {
  href: string | null;
  title: string;
  /** يُحذف حين لا سنة للصفّ — والتقرير منه، فلا يُرسم «٠» */
  year?: number;
  meta: ReactNode;
  value?: ReactNode;
  /**
   * وسمُ الصفّ **عقدةً لا بيانات**. كان `{text, tone}`، فلمّا صار وسمُ
   * الطلب يجمع حالتَه ومرحلتَه في قراءةٍ واحدة («أُلغي عند الدفع») لم
   * يكفِ نصٌّ ولونٌ — والمنطق موضعُه المكوّن لا الصفّ.
   */
  badge?: ReactNode;
}) {
  /**
   * ═══ الرابطُ يمتدّ ولا يلفّ ═══
   *
   * كان الصفُّ كلُّه داخل `<Link>`، وتحته «اطلب خدمة» و«اعرضها للبيع»
   * رابطان — **`<a>` داخل `<a>`**. وHTML لا يجيزه، فيعيد المتصفّح
   * بناء الشجرة ويسقط التصيير بـ«Hydration failed» على أربع شاشات
   * حساب. وهو الصنفُ الذي وُلدت منه البوابة ٤٨ (`<a><button>`)،
   * **أفلتَ منها لأنّ التداخل يعبر حدَّ المكوّن**: اللافُّ هنا والملفوفُ
   * في خاصّية `value` يبعثها النداء.
   *
   * والعلاجُ الامتداد: العنوانُ هو الرابط، و`after:inset-0` يمدّ
   * مساحتَه على البطاقة كلِّها — فتُفتح بالنقر في أي موضع، وتبقى
   * الأفعالُ (`relative z-10`) إخوةً له لا أبناء.
   */
  const body = (
    <div
      className={cn(
        'relative flex items-start justify-between gap-4 rounded-lg border border-line bg-surface p-4',
        href === null ? '' : 'transition-opacity hover:opacity-80',
      )}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-2 text-sm font-bold">
          {href === null ? (
            title
          ) : (
            <Link href={href} className="after:absolute after:inset-0 after:content-['']">
              {title}
            </Link>
          )}
          {year === undefined ? null : (
            <span className="font-num text-2xs opacity-65">
              <ArabicNumber value={year} grouped={false} />
            </span>
          )}
          {badge}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs opacity-70">{meta}</p>
      </div>
      {value === undefined ? null : <div className="shrink-0 text-end">{value}</div>}
    </div>
  );

  return href === null ? <div className="opacity-70">{body}</div> : body;
}

export { Money };
