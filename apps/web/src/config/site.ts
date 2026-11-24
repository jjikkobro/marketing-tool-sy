/**
 * 배포 환경마다 달라지는 값은 Vite 환경변수로 덮어쓸 수 있다.
 * 예) VITE_GITHUB_REPO_URL=https://github.com/<user>/<repo>
 */
export const siteConfig = {
  name: 'Social Collector',
  description: 'TikTok·Instagram 콘텐츠를 수집하고 실패·누락·중복을 기록하는 수집 에이전트',
  githubRepoUrl:
    import.meta.env.VITE_GITHUB_REPO_URL ?? 'https://github.com/jjikkobro/marketing-tool-sy',
} as const;
