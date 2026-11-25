import type { ContentDraft, DraftBody, Proposal } from '@studio/collector/schema';
import { Check, Copy, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { cn } from '../../lib/cn';
import { formatKst } from '../../lib/format';

const statusMeta: Record<ContentDraft['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: '발행 대기', tone: 'brand' },
  blocked: { label: '가드 차단', tone: 'critical' },
  published: { label: '발행 확정', tone: 'positive' },
  discarded: { label: '버림', tone: 'muted' },
};

const checkLabel: Record<ContentDraft['checks'][number]['check'], string> = {
  schema: '형식',
  grounded_numbers: '데이터 숫자',
  hashtags: '해시태그',
};

interface DraftCardProps {
  draft: ContentDraft;
  brief: Proposal | null;
  reviewable: boolean;
  reviewer: string;
  pending: boolean;
  error: string | null;
  onPublish: (input: { note: string; edits: Partial<DraftBody> }) => void;
  onDiscard: (note: string) => void;
}

/**
 * 초안 하나. 발행 대기 상태면 마케터가 바로 고칠 수 있다.
 * 고친 본문도 서버에서 같은 숫자 검사를 다시 거친다 (검증 안 된 수치가 최종본에 들어가지 않게).
 */
export function DraftCard({
  draft,
  brief,
  reviewable,
  reviewer,
  pending,
  error,
  onPublish,
  onDiscard,
}: DraftCardProps) {
  const [title, setTitle] = useState(draft.title);
  const [script, setScript] = useState(draft.script);
  const [caption, setCaption] = useState(draft.caption);
  const [hashtags, setHashtags] = useState(draft.hashtags.join(' '));
  const [note, setNote] = useState('');
  const editable = draft.status === 'draft' && reviewable;
  const noReviewer = reviewer.trim() === '';
  const failed = draft.checks.filter((c) => !c.passed);
  const tags = hashtags
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, ''))
    .filter(Boolean);

  return (
    <Card className={cn('p-6', draft.status === 'draft' && 'border-brand/40')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={statusMeta[draft.status].tone}>{statusMeta[draft.status].label}</Badge>
        {draft.draftedBy.startsWith('claude:') ? (
          <Badge tone="positive">Claude 실시간 초안</Badge>
        ) : (
          <Badge tone="muted">템플릿 초안</Badge>
        )}
        <span className="font-display text-xs text-ink-500">초안 #{draft.id}</span>
        {brief && (
          <span className="text-xs text-ink-600">
            · 기획안 #{brief.id} {brief.title}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-3">
          <Field label="제목">
            {editable ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClass}
              />
            ) : (
              <p className="font-semibold">{draft.title}</p>
            )}
          </Field>
          <Field label="장면별 대본">
            {editable ? (
              <textarea
                rows={5}
                value={script}
                onChange={(e) => setScript(e.target.value)}
                className={inputClass}
              />
            ) : (
              <p className="text-sm whitespace-pre-line">{draft.script || '—'}</p>
            )}
          </Field>
          <Field label="캡션">
            {editable ? (
              <textarea
                rows={3}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className={inputClass}
              />
            ) : (
              <p className="text-sm whitespace-pre-line">{draft.caption || '—'}</p>
            )}
          </Field>
          <Field label="해시태그">
            {editable ? (
              <input
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                placeholder="띄어쓰기로 구분"
                className={inputClass}
              />
            ) : (
              <p className="text-sm text-ink-600">
                {draft.hashtags.map((t) => `#${t}`).join(' ') || '—'}
              </p>
            )}
          </Field>
        </div>

        <section aria-label="가드 검사">
          <p className="text-xs font-semibold">
            가드 검사 {draft.checks.length - failed.length}/{draft.checks.length}
          </p>
          <ul className="mt-2 space-y-1.5">
            {draft.checks.map((check) => (
              <li key={check.check} className="flex gap-2 text-xs">
                {check.passed ? (
                  <Check aria-label="통과" className="mt-px size-3.5 shrink-0 text-positive" />
                ) : (
                  <X aria-label="실패" className="mt-px size-3.5 shrink-0 text-burgundy" />
                )}
                <span>
                  <span className={check.passed ? 'text-ink-600' : 'font-semibold text-burgundy'}>
                    {checkLabel[check.check]}
                  </span>
                  <span className="block text-ink-500">{check.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          {draft.status === 'published' && <CopyButton draft={draft} />}
        </section>
      </div>

      <footer className="mt-5 border-t border-ink-100 pt-4 text-xs text-ink-600">
        <p>
          작성: <span className="font-mono">{draft.draftedBy}</span> · {formatKst(draft.createdAt)}
        </p>
        {draft.status === 'blocked' && (
          <p className="mt-1 text-burgundy">
            가드를 통과하지 못해 발행할 수 없습니다. 이 기획안으로 초안을 다시 만들 수 있습니다.
          </p>
        )}
        {(draft.status === 'published' || draft.status === 'discarded') && (
          <p className="mt-1">
            {draft.status === 'published' ? '발행 확정' : '버림'}:{' '}
            <span className="font-semibold text-charcoal">{draft.reviewer}</span> ·{' '}
            {formatKst(draft.reviewedAt)}
            {draft.editedBy && <> · {draft.editedBy}이(가) 본문을 고침</>}
            {draft.reviewNote && <> · “{draft.reviewNote}”</>}
          </p>
        )}
        {editable && (
          <div className="mt-3 space-y-2">
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="메모 (버릴 때는 필수)"
              className={inputClass}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={pending || noReviewer}
                onClick={() =>
                  onPublish({ note, edits: { title, script, caption, hashtags: tags } })
                }
              >
                {pending ? '처리 중…' : '발행 확정'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending || noReviewer || note.trim() === ''}
                onClick={() => onDiscard(note)}
              >
                버리기
              </Button>
              {noReviewer && <span>검토자 이름을 먼저 입력하세요</span>}
              {error && (
                <span role="alert" className="text-burgundy">
                  {error}
                </span>
              )}
            </div>
            <p className="text-ink-500">
              발행 확정은 최종본을 기록하는 단계입니다. 이 데모는 실제 SNS에 게시하지 않습니다.
            </p>
          </div>
        )}
      </footer>
    </Card>
  );
}

const inputClass =
  'w-full rounded-square border border-ink-300 px-3 py-2 text-sm text-charcoal placeholder:text-ink-500';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-ink-600">{label}</p>
      {children}
    </div>
  );
}

function CopyButton({ draft }: { draft: ContentDraft }) {
  const [copied, setCopied] = useState(false);
  const text = `${draft.caption}\n\n${draft.hashtags.map((t) => `#${t}`).join(' ')}`;
  return (
    <Button
      size="sm"
      variant="secondary"
      className="mt-4"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setCopied(true));
      }}
    >
      <Copy aria-hidden className="size-3.5" />
      {copied ? '복사했습니다' : '캡션·해시태그 복사'}
    </Button>
  );
}
