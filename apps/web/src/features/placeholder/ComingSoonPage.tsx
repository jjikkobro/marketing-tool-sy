import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import type { NavItem } from '../../app/navigation';

/** 아직 이전하지 않은 화면. 어떤 원본 기능을 재구성하는지 먼저 보여준다. */
export function ComingSoonPage({ item }: { item: NavItem }) {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="In Progress" title={item.label} description={item.summary} />
      <Card className="px-8 py-14 text-center">
        <div aria-hidden className="mx-auto flex items-center justify-center gap-2">
          <span className="size-6 rounded-square border-2 border-charcoal" />
          <span className="size-6 rounded-full bg-brand" />
        </div>
        <p className="mt-5 text-sm font-semibold">이 화면은 TypeScript로 옮기는 중입니다</p>
        <p className="mt-1.5 text-sm text-ink-600">원본 기능: {item.origin}</p>
      </Card>
    </div>
  );
}
