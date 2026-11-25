import { setReviewer, useReviewer } from './reviewer';

/** 누가 결정했는지 기록하기 위한 이름. 비어 있으면 결정 버튼이 비활성화된다. */
export function ReviewerField({ reviewable }: { reviewable: boolean }) {
  const reviewer = useReviewer();
  if (!reviewable) return <span className="text-xs text-ink-600">정적 스냅샷 · 읽기 전용</span>;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-600">검토자</span>
      <input
        value={reviewer}
        onChange={(event) => setReviewer(event.target.value)}
        placeholder="이름"
        className="h-8 w-36 rounded-square border border-ink-300 px-2.5 text-sm"
      />
    </label>
  );
}
