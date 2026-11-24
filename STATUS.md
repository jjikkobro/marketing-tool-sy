# STATUS: 작업 현황판

> 이 프로젝트를 맡는 모든 에이전트와 사람이 함께 보는 단일 현황판이다.
> 작업 전에 읽고, 작업 후 갱신해서 **같은 커밋에** 포함한다. 규칙은 [AGENTS.md](AGENTS.md)에 있다.

- **현재 단계**: v0.3 — 레드팀 검토 대응 완료 (가드 8검사, CSRF 방어, 조건부 상태 전이, 주기 계획·피드백) → 지원자 검토·서명, Pages 활성화
- **마지막 갱신**: 2026-11-24 · Claude Code (Opus 5.5)
- **저장소**: https://github.com/jjikkobro/marketing-tool-sy

---

## 1. 목표

삼양라운드스퀘어 **Popow – AI Agent Builder** 지원 포트폴리오.

정체성은 **"TikTok·Instagram 수집 에이전트"**다. LLM이 다음 수집을 제안하고, 가드가 근거·수치를 SQL로 검증하고, 사람이 승인해야 실행한다. 이전 직장의 마케팅 자동화 툴은 이 문제를 실제로 겪은 배경으로만 쓴다.
이렇게 정한 근거는 [docs/decisions/0001](docs/decisions/0001-포트폴리오-범위.md)에 있다. 다중 에이전트 토론 결과도 여기에 정리되어 있다.

### 채용공고 요약 (판단 기준)

출처: https://samyangroundsquare.ninehire.site/job_posting/BTr6sMIr

- **주요 업무**
  - TikTok·Instagram 키워드·계정을 탐색한다.
  - 브라우저 자동화와 API로 콘텐츠를 수집한다.
  - 실패·누락·중복·플랫폼 변화에 대응하고 점검을 자동화한다.
  - 필요하면 데이터를 집계한다.
- **우대**: 크롤링·브라우저 자동화·API 연동, MCP, 반복 실행 프로그램의 장애 대응, SQL, 집계·시각화, TypeScript + Python
- **제출 질문**: ① 해결하려던 문제 ② 구조와 이유(AI 제안 검토 포함) ③ 잘 된 점과 문제점 ④ 해결 방법과 확인 방법 → README가 이 순서를 그대로 따른다.

## 2. 사용자 고정 조건 (바꾸지 말 것)

- GitHub 공개 저장소 `marketing-tool-sy` (이름 유지)
- 이전 직장의 서비스명과 로고 미사용
- 툴 상단 고지 배너 (지원용 데모, 공식 서비스 아님, 가상 데이터)
- 우측 하단 GitHub 플로팅 버튼
- 삼양라운드스퀘어 BI 톤앤매너 (컬러와 서체만)
- TypeScript, 코드 품질

## 3. 작업 보드

### 지원자가 직접 해야 할 일 (에이전트가 대신할 수 없음)
0. [ ] **GitHub Pages 활성화**: 저장소 Settings → Pages → Source를 "GitHub Actions"로 변경 → Actions에서 "Deploy to GitHub Pages" 재실행. 주소: https://jjikkobro.github.io/marketing-tool-sy/
1. [ ] `docs/decisions/0001`의 "지원자 확인" 4항목을 점검하고 서명한다
2. [ ] README §1의 운영 경험 서술이 사실과 맞는지 확인한다 (운영 기간, 실제 겪은 장애). 다르면 고친다
3. [ ] README ①~④를 **본인 문장으로** 다듬는다. AI 초안을 그대로 내지 않는다
4. [ ] Claude Code에 MCP를 연결해 실제로 대화하는 30초 영상을 녹화한다 (observe → propose_action → 웹에서 승인) → README 상단에 링크
4-1. [ ] ANTHROPIC_API_KEY로 `npm run agent -- plan --planner claude`를 한 번 실제로 돌려 결과를 확인한다 (미검증 상태)
5. [ ] 면접 대비: 아래 "예상 질문"에 답을 준비하고, 아무 파일이나 열어 3분 동안 설명해 본다
6. [ ] GitHub 저장소 About 설명과 토픽(`tiktok`, `instagram-api`, `mcp`, `playwright`, `data-pipeline`)을 설정한다
7. [ ] 제출할 때 `v0.1-submitted` 태그를 단다

### 다음 할 일 (에이전트 가능)
1. [ ] 본인 계정으로 Instagram Graph API(Business Discovery)를 실제로 호출해 검증한다 *(사용자의 Meta 앱과 토큰 필요)*
2. [ ] 읽기 전용 Python 분석 `analysis/`: 수집 건강 리포트, 가드 차단 유형 통계
3. [ ] 웹 단위 테스트 (필터 파서, 포맷터, ImpactPanel 계산)
4. [ ] 가드: 한글 숫자("열두 건") 탐지, 비율·증감 주장 검증

### 완료
- [x] 원본 분석. 민감 파일을 제외하고 `legacy/`에 압축 해제
- [x] Roundsquare CI 토큰 (Tailwind v4 `@theme`, 접근성 대비 보정)
- [x] 다중 에이전트 토론 2라운드 → 범위 결정 (0001)
- [x] collector: TikTok Research·Instagram Graph·브라우저 어댑터, 재시도·오류 분류, 중복 제거, 구조 변화 감지, SQLite 저장
- [x] 원본 버그 3건 회귀 테스트, 실행에서 발견한 문제 5건 수정 (0002)
- [x] CLI 데모 (`demo`, `demo:fail`, `demo:browser`), MCP 서버(도구 5개), 스냅샷 export
- [x] web: 수집, 운영 모니터, AI 연결 3개 화면 (스냅샷 재생, 런타임 검증)
- [x] CI: 금지어 검사, typecheck, lint, format, test(Chromium 포함), demo:fail, build
- [x] README (제출 질문 4개 구조), 스크린샷
- [x] **에이전트 루프** (0003): 관찰(factId) → Claude 구조화 출력 제안 → 가드 7검사 → 사람의 승인·거절·확인(CLI·웹) → 승인 시점 재검증 → 실행·기록. DB CHECK로 결정 기록 강제
- [x] MCP: observe, propose_action, list_proposals 추가 (승인 도구 없음)
- [x] 녹화 데이터 링크를 "가상 URL"로 표시 (클릭 불가)
- [x] 첫 화면 "이 툴이 바꾸는 것" 패널 + README §0 목적과 효과 (수치는 실행 기록에서 계산)
- [x] GitHub Pages 배포 워크플로 (base 경로, SPA 404 대체)

## 4. 결정 기록 요약

| 날짜 | 결정 | 근거 |
|---|---|---|
| 11-24 | 마케팅 툴 리스킨이 아니라 수집 에이전트로 재정의 | 0001 (토론 4인 합의) |
| 11-24 | 워크스페이스 2개, SQLite + 직접 쓴 SQL, 테이블 3개 | 0001 (공고의 "복잡도 줄이기") |
| 11-24 | TikTok oEmbed 실데이터 점검 기각 | 0001 (약관 III.3(h), 문서상 필드 없음, 폐기 예정) |
| 11-24 | 실존 브랜드명 데모 데이터 삭제, 가상 계정만 사용 | 0001 (사칭·아첨 위험) |
| 11-24 | primary 버튼은 차콜, 오렌지 글자는 `#C24A00` | `#FF6400` 위 흰 글자 대비 2.97:1 |
| 11-24 | 에이전트 루프 추가: LLM은 제안만, 숫자는 SQL, 결정은 사람 | 0003 (자기 평가: 이전 버전은 에이전트가 아니었음) |
| 11-24 | 로컬 검토 API 추가 (0001의 "HTTP 서버 없음"을 뒤집음) | 0003 (사람의 확인 화면에 쓰기 경로 필요, 127.0.0.1 한정) |
| 11-24 | 레드팀 우회 대응: target 검사, 숫자는 claims 값만, CSRF 4중 방어, 조건부 전이, 거절 기억 | 0004 |
| 11-24 | 배포는 GitHub Pages (Vercel 아님) | 계정 연동 없이 저장소 워크플로만으로 배포 가능. 정적 스냅샷이라 서버 불필요 |

## 5. 면접 예상 질문 (토론에서 면접관 역할이 뽑은 질문)

1. 플랫폼이 필드나 DOM을 바꾸면 언제, 어떻게 감지하는가? → 채움 비율 비교, 셀렉터 0건과 블록 수 비교. 한계는 값의 의미 변화
2. 중복 키는? 원본 `fingerprint` 버그는 어떻게 찾고 확인했는가?
3. 429와 401의 처리 차이는? 하루치 데이터가 날아갈 뻔한 실제 사례는?
4. AI 에이전트 제안을 기각한 실제 사례와 검증 방법은? → oEmbed (0001)
5. 키워드가 수천 개로 늘면 가장 먼저 깨지는 것은? → IG 7일 30개 해시태그 제한, TikTok 하루 1,000회
6. 원본에서 SNS 자동 수집을 꺼 둔 이유는? *(지원자 본인 답 필요)*

## 6. 인계 로그

새 항목을 맨 위에 추가한다.

### 2026-11-24 (4) · Claude Code (Opus 5.5)
- **한 일**: 독립 레드팀 검토(재현 포함) 결과를 반영했다 (0004)
  - 가드: target 검사 추가. 숫자는 claims 값만 허용. 단위·한글 수사·전각 숫자·숨긴 숫자 거부. 쿼리 정규화. 거절 기억
  - 검토 API: Host·Origin·Content-Type·토큰 검사
  - CLI: `--reviewer` 필수, 터미널 재확인, 실행 대상 열 표시
  - 상태 전이: 트랜잭션 + 조건부 UPDATE. execution_error 분리(마이그레이션 003)
  - 재검증 근거는 `factById`로 DB에서 직접 계산
  - `agent watch` 추가. 관찰에 사람의 최근 결정을 넣어 피드백으로 쓴다
- **확인**
  - 테스트 78개 통과
  - 고친 부분을 끄면 해당 테스트가 실패하는 것을 확인했다
  - curl로 CSRF를 재현하면 403이 돌아온다
  - 웹에서 토큰을 거친 승인이 실행 #12까지 이어진다
- **남은 한계**: 0004 "정직하게 남긴 한계"

### 2026-11-24 (3) · Claude Code (Opus 5.5)
- **한 일**
  - 지원자 피드백에 따라 에이전트 루프를 추가했다 (LLM 제안, 할루시네이션 가드, 사람의 확인)
  - MCP 제안 도구, 로컬 검토 API와 웹 검토 화면을 만들었다
  - 링크 표시를 고쳤고, 목적·효과 패널과 README §0을 추가했다
  - GitHub Pages 배포를 준비했다
- **확인**
  - 테스트 58개 통과
  - 가드와 재검증을 일부러 꺼 테스트가 실패하는 것을 확인했다
  - MCP 클라이언트로 제안했을 때 pending과 blocked가 의도대로 나뉘었다
  - 웹에서 Playwright로 승인을 눌러 실행 #12가 생기는 것을 확인했다
  - 하위 경로(/marketing-tool-sy/) 미리보기에서 직접 URL 접근과 읽기 전용 동작을 확인했다
- **주의**
  - Pages는 저장소 설정에서 한 번 활성화해야 한다 (위 작업 보드 0번)
  - `claudePlanner`는 API 키가 없어 실호출을 검증하지 못했다

### 2026-11-24 (2) · Claude Code (Opus 5.5)
- **한 일**
  - 다중 에이전트 토론 → 범위 재정의
  - collector 전체 구현, web 3개 화면으로 재구성
  - CI, README, ADR 0001·0002 작성
- **확인**
  - 아래 6개 명령 모두 통과 (테스트 40개, Chromium 포함)
    `npm run check:leaks`, `typecheck`, `lint`, `format:check`, `test`, `build`
  - `demo:fail` 출력 확인
  - MCP 서버를 실제 클라이언트로 연결해 도구 호출 확인
  - 웹 3개 화면 스크린샷 확인, 콘솔 에러 0
- **주의**
  - WSL에 Chromium 시스템 라이브러리가 없다. 로컬에서는 scratchpad에 받은 라이브러리를 `LD_LIBRARY_PATH`로 지정해서 돌렸다. 정식으로 쓰려면 `sudo npx playwright install-deps chromium`
  - 스냅샷(`apps/web/public/data/snapshot.json`)은 `npm run snapshot`으로 다시 만든다. Chromium이 필요하다
  - 실서비스 API 호출은 검증하지 않았다. README §6에 그렇게 명시했다

### 2026-11-24 (1) · Claude Code (Opus 5.5)
- 원본 분석, 디자인 토큰, 웹 셸, 성과 대시보드(이후 삭제)
