# 원본 분석

원본은 `legacy/`에 있다(이전 직장의 콘텐츠 자동화 툴, JS). git에는 올리지 않는다.

## 원본 규모 (분석 결과)

| 영역 | 구성 |
|---|---|
| 클라이언트 | React 18 + Vite + Tailwind 3, JSX, 페이지 17개(약 8.5k줄, 그중 Dashboard·InstaGenerator가 각각 47KB·55KB) |
| 서버 | Express, `src/server.js` 단일 파일(86KB, 라우트 89개), pipeline 에이전트 30여 개 |
| DB | Prisma + SQLite, 모델 26개, 마이그레이션 30개 |
| 외부 연동 | Azure OpenAI, Slack, Meta(Instagram·Threads), PostHog, Google Sheets, Toss, SMTP 등 환경변수 50여 개 |
| 테스트 | node:test 11개 파일 |

진행 순서와 우선순위는 [STATUS.md](../STATUS.md)를 본다.
