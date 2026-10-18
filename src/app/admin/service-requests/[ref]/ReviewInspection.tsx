'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { useTranslations } from 'next-intl';

/**
 * ═══ مراجعةُ الفحص — يُعاد بملاحظة أو يُعتمد فيصدر ═══
 *
 * **ولا يُنشأ التقرير قبل الاعتماد**: «المنشور لا يُسترجَع» (قرار
 * المالك ٤)، فإصدارُه قبل المراجعة يجعل الخطأ غيرَ قابلٍ للسحب.
 *
 * **والنشرُ على الإعلان ليس قرارَ المراجع**: تقريرُ البائع عامّ،
 * وتقريرُ المشتري خاصٌّ به — والقاعدةُ في `publishOnIssue` وحدها،
 * والشاشةُ تقول ما سيقع قبل الضغط.
 */
const MIN_NOTE = 10;

export function ReviewInspection({
  draftId,
  score,
  grade,
  flagged,
  willPublish,
}: {
  draftId: string;
  score: number;
  grade: string;
  flagged: boolean;
  /** أسيصير عامًّا على الإعلان؟ — يُقال قبل الضغط لا بعده. */
  willPublish: boolean;
}) {
  /**
   * **والتقديرُ بتسميته لا بتعداده.** «EXCELLENT» على شاشةٍ عربية
   * ليست تسميةً بل تسريبُ تعدادٍ من المخطّط — والتسميةُ قائمةٌ في
   * `ui.grade` يقرؤها العرضُ العامّ منذ بُني، فلا تُكتب ثانيةً.
   */
  const t = useTranslations('ui');
  const router = useRouter();
  const [busy, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [returning, setReturning] = useState(false);

  const send = (body: unknown, done: string): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/inspections/${draftId}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => null);

      if (response === null || !response.ok) {
        setToast('تعذر التنفيذ.');
        return;
      }
      setToast(done);
      router.refresh();
    });
  };

  return (
    <>
      <div className="mb-3.5 flex flex-wrap items-center gap-3">
        <Badge tone="warn">ينتظر المراجعة</Badge>
        <span className="font-num text-base font-bold">
          <ArabicNumber value={score} />
        </span>
        <span className="text-2xs opacity-70">{grade === '' ? '—' : t(`grade.${grade}`)}</span>
        {flagged ? <Badge tone="danger">بند حرج ساقط</Badge> : null}
      </div>

      <p className="mb-3.5 text-2xs leading-loose opacity-75">
        {willPublish
          ? 'طالبه صاحب المركبة — فالتقرير يصير عاما على الإعلان بالاعتماد، ولا يسترجع.'
          : 'طالبه ليس صاحب المركبة — فالتقرير يبقى خاصا به ولا يظهر على الإعلان.'}
      </p>

      {returning ? (
        <div className="flex flex-col gap-2.5">
          <textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="ما الذي يعيده؟ — يقرؤه الفاحص"
            className="rounded-md border border-line bg-surface px-3 py-2 text-2xs leading-loose"
          />
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || note.trim().length < MIN_NOTE}
              onClick={() => send({ action: 'return', note: note.trim() }, 'أعيدت إلى الفاحص.')}
            >
              {busy ? 'جاري…' : 'أعدها بهذه الملاحظة'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReturning(false)}>
              إلغاء
            </Button>
          </span>
        </div>
      ) : (
        <span className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => send({ action: 'approve' }, 'اعتمد وصدر التقرير.')}
          >
            {busy ? 'جاري…' : 'اعتمد وأصدر'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setReturning(true)}>
            أعدها بملاحظة
          </Button>
        </span>
      )}

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
