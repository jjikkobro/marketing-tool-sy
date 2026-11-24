# AGENTS.md: 작업 규칙

이 저장소에서 일하는 모든 에이전트와 사람을 위한 규칙이다.

## 시작과 끝
1. 시작할 때 [STATUS.md](STATUS.md)를 읽는다. 우선순위와 "다음 할 일"을 따른다.
2. 끝낼 때 STATUS.md의 작업 보드와 인계 로그를 갱신하고, 코드와 **같은 커밋**에 넣는다.
3. 설계를 바꾸는 결정을 했다면 `docs/decisions/NNNN-제목.md`에 남긴다. AI가 낸 제안을 채택·수정·기각했는지와 그 이유를 쓴다.

## 경계
- `legacy/`는 원본 참고용이다. 읽기만 하고, 수정하거나 커밋하지 않는다.
- 이전 회사의 서비스명, 로고, 프롬프트 원문, 실제 데이터(수신자, 지표, 기업 목록)를 새 코드에 가져오지 않는다.
- 삼양라운드스퀘어 CI 심볼과 로고 파일은 쓰지 않는다. 컬러와 서체 규정만 따른다.
- 비밀값은 커밋하지 않는다. `.env.example`만 둔다.

## 구조
```
apps/web        React 19 + Vite + TS(strict) + Tailwind v4
apps/server     (예정) Express + TS + Prisma
apps/mcp        (예정) MCP 서버
packages/shared (예정) 도메인 타입, zod 스키마
legacy/         원본 (git 제외)
```

## 코드 규칙
- TypeScript strict 모드에 `noUncheckedIndexedAccess`를 켠다. `any`와 non-null 단언(`!`)은 쓰지 않는다.
- 화면은 `features/<도메인>/`, 공통 UI는 `components/ui/`에 둔다. 데이터는 `api/*`의 `queryOptions`로만 접근한다.
- 색상, 반경, 서체는 `apps/web/src/styles/index.css`의 `@theme` 토큰만 쓴다. 임의의 hex 값(`text-[#...]`)은 금지한다.
  - 네모(구조 요소): `rounded-square`
  - 동그라미(배지, 버튼, 상태): `rounded-full`
  - 흰 배경 위 오렌지 글자: `text-brand-700`
- 값이 없으면 0 대신 `—`를 보여준다 (`lib/format.ts`).
- 주석은 "왜"를 한국어로 쓴다.

## 검증
커밋하기 전에 아래 명령이 모두 통과해야 한다.

```bash
npm run typecheck
npm run lint
npm run build
npm run format:check
```

UI를 바꿨다면 스크린샷으로 확인한다.

## 커밋
- 메시지는 한국어로 쓰고, 접두어 `feat|fix|refactor|docs|chore|test:`를 붙인다.
- 하나의 작업 단위를 하나의 커밋으로 만든다.
