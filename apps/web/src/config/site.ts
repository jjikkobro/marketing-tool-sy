/**
 * 배포 환경마다 달라지는 값은 Vite 환경변수로 덮어쓸 수 있다.
 * 예) VITE_GITHUB_REPO_URL=https://github.com/<user>/<repo>
 */
export const siteConfig = {
  name: 'Content Studio',
  description: '브랜드 콘텐츠 기획부터 제작, 발행, 성과 분석까지 한 흐름으로 운영하는 툴',
  githubRepoUrl:
    import.meta.env.VITE_GITHUB_REPO_URL ?? 'https://github.com/jjikkobro/marketing-tool-sy',
} as const;
