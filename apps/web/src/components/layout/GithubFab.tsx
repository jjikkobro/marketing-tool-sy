import { siteConfig } from '../../config/site';
import { GithubMark } from '../icons/GithubMark';

/** 우측 하단 플로팅 버튼. 담당자가 코드를 바로 확인할 수 있도록 저장소로 연결한다. */
export function GithubFab() {
  return (
    <a
      href={siteConfig.githubRepoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group fixed right-6 bottom-6 z-40 flex h-12 items-center gap-2 rounded-full bg-charcoal pr-5 pl-4 text-sm font-semibold text-white shadow-lg shadow-black/15 transition-colors hover:bg-black"
    >
      <GithubMark className="size-5" />
      GitHub에서 코드 보기
      <span className="sr-only">(새 창에서 열림)</span>
    </a>
  );
}
