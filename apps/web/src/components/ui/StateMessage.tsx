/** 로딩·오류 상태. 모든 화면이 같은 모양을 쓰도록 한 곳에 둔다. */
export function LoadingBlock({ className = 'h-64' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-square bg-ink-100 ${className}`} />;
}

export function ErrorMessage({ error }: { error: Error }) {
  return (
    <p
      role="alert"
      className="rounded-square border border-burgundy/20 bg-burgundy-50 px-5 py-4 text-sm text-burgundy"
    >
      {error.message}
    </p>
  );
}
