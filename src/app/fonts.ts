import localFont from 'next/font/local';

/**
 * ═══ الخطّان مستضافان في المستودع — لا جلبَ وقت البناء ═══
 *
 * كانا يُجلبان بـ`next/font/google`، **فكلُّ صورةِ إنتاج تعتمد على أن
 * يردّ `fonts.googleapis.com` لحظةَ `npm run build`**. وسقط النشر
 * مرّتين متتاليتين بـ:
 *
 *   src/app/admin/layout.tsx
 *   An error occurred in `next/font`.
 *   TypeError: Cannot read properties of null (reading '1')
 *
 * وهي رسالةُ المُحمِّل حين يفشل تحليلُ ما جلبه — ولا تذكر الشبكة ولا
 * جوجل. **وقِيس أوّلَ مرّة فبدا عارضًا**: `curl` من المضيف ردّ ٢٠٠،
 * وحاويةُ `node:22-alpine` جلبت `@font-face` سليمًا. ثمّ سقط ثانيةً —
 * فالعارضُ الذي يتكرّر ليس عارضًا.
 *
 * ═══ وما يشتريه الاستضافة ═══
 *
 * بناءٌ لا يسقط لسببٍ خارج المستودع، ونشرةٌ لا تنتظر طرفًا ثالثًا،
 * وطلبٌ أقلّ في أوّل فتحةِ صفحة. والثمن ١٢٨ كيلوبايت في المستودع.
 *
 * ═══ والرخصة ═══
 *
 * الخطّان تحت **SIL Open Font License 1.1**، وهي تجيز الاستضافة
 * الذاتية وإعادة التوزيع. ونسختُها في `src/app/fonts/OFL.txt`.
 *
 * ═══ وموضعٌ واحد لثلاثة تخطيطات ═══
 *
 * كان التعريف منسوخًا حرفًا بحرف في `[locale]` و`admin` و`provider` —
 * ثلاثُ نسخٍ تتباعد أوّلَ تغييرٍ في وزن. وهي هنا مرّةً واحدة.
 */

/**
 * **و`Figtree` خطٌّ متغيّر**: جوجل يردّ الملفّ نفسَه لكلّ وزنٍ يُطلب
 * (قِيس: بصمةٌ واحدة لثلاثة أوزان)، فملفٌّ واحد لكلّ مجموعةِ محارف
 * ومدًى للوزن — لا ثلاثُ نسخٍ من ملفٍّ واحد.
 */
export const figtree = localFont({
  src: [
    { path: './fonts/Figtree-variable-latin.woff2', weight: '400 700', style: 'normal' },
    { path: './fonts/Figtree-variable-latin-ext.woff2', weight: '400 700', style: 'normal' },
  ],
  variable: '--font-figtree',
  display: 'swap',
});

/** و`Tajawal` ثابتُ الأوزان — ملفٌّ لكلّ وزنٍ ومجموعةِ محارف. */
export const tajawal = localFont({
  src: [
    { path: './fonts/Tajawal-400-arabic.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Tajawal-400-latin.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Tajawal-500-arabic.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Tajawal-500-latin.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Tajawal-700-arabic.woff2', weight: '700', style: 'normal' },
    { path: './fonts/Tajawal-700-latin.woff2', weight: '700', style: 'normal' },
    { path: './fonts/Tajawal-800-arabic.woff2', weight: '800', style: 'normal' },
    { path: './fonts/Tajawal-800-latin.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-tajawal',
  display: 'swap',
});
