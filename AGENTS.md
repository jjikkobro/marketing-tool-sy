# AGENTS.md: 작업 규칙

이 저장소에서 일하는 모든 에이전트와 사람을 위한 규칙이다.

## 시작과 끝
1. 시작할 때 [STATUS.md](STATUS.md)를 읽는다. 우선순위와 "다음 할 일"을 따른다.
2. 끝낼 때 STATUS.md의 작업 보드와 인계 로그를 갱신하고, 코드와 **같은 커밋**에 넣는다.
3. 설계를 바꾸는 결정을 했다면 `docs/decisions/NNNN-제목.md`에 남긴다. AI가 낸 제안을 채택·수정·기각했는지와 그 이유를 쓴다.
4. 실행해 보고서야 드러난 문제는 `docs/decisions/0002-실행에서-발견한-문제.md`에 추가한다.

## 경계
- `legacy/`는 원본 참고용이다. 읽기만 하고, 수정하거나 커밋하지 않는다.
- 이전 직장의 서비스명, 계정명, 프롬프트 원문, 실제 데이터를 새 코드에 가져오지 않는다. CI의 `npm run check:leaks`가 검사한다.
- 실존 브랜드나 제품명에 지어낸 수치를 붙이지 않는다. 데모 계정은 `demo_creator_NN` 형식만 쓴다.
- 삼양라운드스퀘어 CI 심볼과 로고는 쓰지 않는다. 컬러와 서체만 따른다.
- 실제 SNS를 스크래핑하지 않는다. 브라우저 자동화는 `apps/collector/fixtures/mock-feed/`만 대상으로 한다.
- TikTok·Instagram 실제 데이터는 검색 API(`adapters/web-search.ts`, Tavily)로만 가져온다. 계정 로그인 수집은 만들지 않는다 (0006).
- 실제로 실행해 보지 않은 코드를 "동작한다"고 문서에 쓰지 않는다.
- **사람의 승인 없이 수집을 실행하는 경로를 만들지 않는다.** MCP에 승인·실행 도구를 추가하지 않는다. LLM이 만든 숫자를 검증 없이 화면이나 실행에 쓰지 않는다 (가드를 거친다).
- README와 화면의 효과 수치는 실제 실행 기록(스냅샷)에서 계산한 값만 쓴다. 지어낸 성과 수치는 금지한다.
- YouTube 데이터는 해시태그·포맷 등 어떤 집계에도 넣지 않는다 (정책 III.E.2). 영상 단위로 YouTube가 준 값 그대로만 쓰고, 30일 삭제를 유지한다 (`core/youtube-policy.ts`).
- API 키는 `apps/collector/.env`에만 둔다. `apps/web`의 `.env`나 `VITE_` 변수에 두지 않는다.
- 비밀값은 커밋하지 않는다.

## 구조
```
apps/collector   수집 에이전트 (Node 22, TS, better-sqlite3, zod, MCP SDK, Playwright)
  src/schema.ts      도메인 스키마. web과 공유하는 유일한 계약 (Node API import 금지)
  src/mcp-tools.ts   MCP 도구 정의. mcp.ts와 web이 같이 쓴다 (Node API import 금지)
  src/adapters/      fetchPage(IO) + parsePage(순수 함수)
  src/core/          재시도, 식별·정규화, 지표, 구조 변화 감지
  src/db/            SQL 마이그레이션, 저장
  src/pipeline/      수집 실행 한 번
  src/queries/       읽기 SQL. CLI, MCP, export가 모두 여기만 쓴다
  src/demo/          문서 기반 픽스처와 데모 시나리오
  src/agent/         관찰 → LLM 제안 → 가드 → 사람의 결정 → 실행 (docs/decisions/0003)
                     availability.ts: 어떤 수집 경로를 쓸 수 있는지 (화면과 가드가 공유)
  src/mcp.ts         MCP 서버 (조회·관찰·제안. 승인 도구 없음)
  src/live/          라이브 데모 서버: 웹 + API, 방문자별 샌드박스, Claude 호출 예산 (docs/decisions/0005)
apps/web         개요·수집·운영·제안 검토 화면 (React 19, Vite, Tailwind v4)
Dockerfile, render.yaml  라이브 데모 배포
docs/decisions/  결정 기록
legacy/          원본 (git 제외)
```

## 코드 규칙
- TypeScript strict 모드에 `noUncheckedIndexedAccess`를 켠다. `any`와 non-null 단언(`!`)은 쓰지 않는다.
- `as` 단언은 DB 행 경계(`better-sqlite3`의 `.get()`/`.all()` 결과)에서만 허용한다. 웹으로 나가는 데이터는 export할 때 `snapshotSchema`로 다시 검증된다. 사용자 입력이나 외부 응답은 zod로 파싱한다.
- 지표는 `null`(수집 못 함)과 `0`을 구분한다. 화면에서는 `null`을 `—`로 표시한다.
- 외부 응답의 선택 필드는 반드시 `.optional()`로 둔다 (0002 §1).
- 웹 색상, 반경, 서체는 `apps/web/src/styles/index.css`의 `@theme` 토큰만 쓴다. 임의의 hex 값은 금지한다.
  - 네모(구조 요소): `rounded-square`
  - 동그라미(배지, 버튼, 상태): `rounded-full`
  - 흰 배경 위 오렌지 글자: `text-brand-700`
- 주석은 "왜"를 한국어로 쓴다.

## 검증
커밋하기 전에 아래 명령이 모두 통과해야 한다.

```bash
npm run check:leaks && npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

- 수집 로직을 바꿨다면 `npm run demo:fail`의 출력도 확인한다.
- 스냅샷 구조를 바꿨다면 `npm run snapshot`으로 다시 만든다.
- UI를 바꿨다면 스크린샷으로 확인한다.
- 버그를 고쳤다면, 고친 코드를 되돌렸을 때 테스트가 실패하는지 확인한다.

## 커밋
- 메시지는 한국어로 쓰고, 접두어 `feat|fix|refactor|docs|chore|test:`를 붙인다.
- 하나의 작업 단위를 하나의 커밋으로 만든다.
