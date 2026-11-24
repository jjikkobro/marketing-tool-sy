/** 화면 최상단 고지. 지원용 포트폴리오이며 공식 서비스가 아니고, 데이터가 가상이라는 점을 분명히 한다. */
export function PortfolioNotice() {
  return (
    <div
      role="note"
      className="bg-charcoal px-6 py-2.5 text-center text-xs leading-relaxed text-white/85"
    >
      <span className="mr-2 inline-block size-1.5 rounded-full bg-brand align-middle" aria-hidden />
      이 툴은 삼양라운드스퀘어 지원을 위해, 포트폴리오에 담은 콘텐츠 수집·자동화 툴 개발 경험을
      재구성해 만든 데모입니다. 삼양라운드스퀘어의 공식 서비스가 아니며, 화면의 계정과 수치는 모두
      가상 데이터입니다.
    </div>
  );
}
