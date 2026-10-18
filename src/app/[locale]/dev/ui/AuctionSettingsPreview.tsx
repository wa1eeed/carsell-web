'use client';

import { useState } from 'react';
import {
  Choice,
  Note,
  PriceField,
  Readout,
  SettingsBlock,
  Toggle,
} from '@/components/site/AuctionSettings';

/**
 * ═══ معاينة قطع لوحة المزاد ═══
 *
 * **ولا تُفتح من المعالج بلا صورة**: خطوة طريقة البيع ثالثةٌ، وقبلها
 * رفعُ صورة يحتاج تخزينًا. فتُراجَع هنا إلى جانب بطاقة التصميم — وهو
 * ما بُني `/dev/ui` له.
 *
 * **ومكوّن عميل لا خادم**: القطع تأخذ خاصّيّاتٍ من نوع دالّة، وتمريرُها
 * من مكوّن خادم يردّ **٥٠٠ كاملة** لا معاينةً ناقصة (البوابة ٢٢ — وهي
 * التي أمسكت هذا الملفّ قبل أن يُدفع).
 *
 * **وحالةٌ حقيقية لا سكونٌ معروض**: مفتاحٌ لا ينقلب في المعاينة يُخفي
 * نصف ما يُراجَع — والحالتان هما موضع المراجعة.
 */
export function AuctionSettingsPreview() {
  const [reserve, setReserve] = useState('');
  const [buyNow, setBuyNow] = useState(false);
  const [start, setStart] = useState('now');

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="overflow-hidden rounded-xl border border-line bg-line">
        <SettingsBlock title="الأسعار">
          <Readout
            label="سعر الافتتاح"
            value="75,000"
            hint="يبدأ منه أول مزايد — والأقل يجذب مزايدين أكثر."
          />
          <PriceField
            label="السعر الاحتياطي (اختياري)"
            hint="أقل سعر تقبل البيع به."
            value={reserve}
            onChange={setReserve}
          />
          <Note>
            السعر الاحتياطي مخفي عن المشترين — يرون «لم يبلغ الاحتياطي» فقط. ولو
            انتهى المزاد دونه فلك أن تقبل أعلى مزايدة أو تردها.
          </Note>
        </SettingsBlock>

        <SettingsBlock title="التوقيت">
          <Choice
            options={[
              { key: 'now', label: 'يبدأ فورا' },
              { key: 'later', label: 'بموعد محدد' },
            ]}
            active={start}
            onSelect={setStart}
          />
          <Toggle
            label="أضف سعر «اشتر الآن»"
            hint="ينهي المزاد فورا لمن يدفعه، ويختفي متى بلغت المزايدات الاحتياطي."
            on={buyNow}
            onToggle={() => setBuyNow(!buyNow)}
          />
        </SettingsBlock>

        <SettingsBlock title="العربون والمزايدون">
          <Readout
            label="من يمكنه المزايدة"
            value="الحسابات الموثقة فقط"
            hint="شرط تفرضه المنصة — ولا يعدل."
          />
          <Note>
            عربون أعلى يقلل عدد المزايدين ويرفع جديتهم. والموصى به 3–5٪ من
            السعر الاحتياطي، لأنه يعكس القيمة الحقيقية لا نقطة البداية.
          </Note>
        </SettingsBlock>
      </div>
    </div>
  );
}
