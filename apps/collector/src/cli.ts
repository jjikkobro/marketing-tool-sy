/**
 * Social Collector CLI
 *
 *   demo [--scenario normal|failures] [--db <path>]   키 없이 녹화 응답으로 수집을 실행하고 결과를 출력
 *   runs | health | errors [--run <id>]               실행 기록 조회
 *   search <text> | related <hashtag>                 수집한 콘텐츠 조회, 관련 해시태그로 탐색 범위 넓히기
 *   export --out <dir>                                웹 화면용 스냅샷(JSON) 생성
 *
 *   agent plan [--planner recorded|claude]            관찰 → LLM 제안 → 가드 검증 → 검토 대기열에 저장
 *   agent list                                        제안과 검증 결과 보기
 *   agent approve <id> --reviewer <이름> [--note]     사람이 승인 → 승인 시점 재검증 → 실행
 *   agent reject <id> --reviewer <이름> --note <사유> 사람이 거절
 *   agent ack <id> --reviewer <이름>                  운영 조치 제안 확인
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { renderTable } from './cli/table.ts';
import { openDatabase, type Db } from './db/database.ts';
import { runScenario, SCENARIOS } from './demo/scenarios.ts';
import {
  adapterHealth,
  listErrors,
  listRuns,
  relatedHashtags,
  searchContents,
} from './queries/index.ts';
import type { CollectionRun, Proposal } from './schema.ts';
import { buildSnapshot } from './snapshot.ts';
import { adapterFactoryFromEnv } from './agent/adapters-from-env.ts';
import { claudePlanner, recordedPlanner } from './agent/planners.ts';
import { acknowledge, approve, planAndGuard, reject } from './agent/review.ts';
import { listProposals } from './agent/store.ts';
import { runAgentDemo } from './demo/agent-demo.ts';
import { userInfo } from 'node:os';

export const DEFAULT_DB = resolve(import.meta.dirname, '../.data/collector.db');

const STATUS_LABEL: Record<CollectionRun['status'], string> = {
  running: '실행 중',
  succeeded: '성공',
  partial: '부분 실패',
  failed: '실패',
};

function printRuns(db: Db) {
  console.log(
    renderTable(listRuns(db, { limit: 50 }).reverse(), [
      { header: '#', value: (r) => r.id, align: 'right' },
      { header: '어댑터', value: (r) => r.adapterId },
      { header: '쿼리', value: (r) => `${r.query.kind}:${r.query.value}` },
      { header: '상태', value: (r) => STATUS_LABEL[r.status] },
      { header: '페이지', value: (r) => r.pagesFetched, align: 'right' },
      { header: '신규', value: (r) => r.inserted, align: 'right' },
      { header: '갱신', value: (r) => r.updated, align: 'right' },
      { header: '중복', value: (r) => r.duplicates, align: 'right' },
      { header: '제외', value: (r) => r.rejected, align: 'right' },
      { header: '재시도', value: (r) => r.retries, align: 'right' },
    ]),
  );
}

function printErrors(db: Db, runId?: number) {
  const errors = listErrors(db, { runId }).reverse();
  if (errors.length === 0) return console.log('기록된 오류가 없습니다.');
  console.log(
    renderTable(errors, [
      { header: '실행', value: (e) => `#${e.runId}`, align: 'right' },
      { header: '단계', value: (e) => e.stage },
      { header: '종류', value: (e) => e.kind },
      { header: '수준', value: (e) => (e.severity === 'error' ? '오류' : '경고') },
      { header: 'HTTP', value: (e) => e.httpStatus, align: 'right' },
      { header: '내용', value: (e) => e.message.replace(/\s+/g, ' ').slice(0, 72) },
    ]),
  );
}

function printHealth(db: Db) {
  console.log(
    renderTable(adapterHealth(db), [
      { header: '어댑터', value: (h) => h.adapterId },
      { header: '실행', value: (h) => h.runs, align: 'right' },
      { header: '성공', value: (h) => h.succeeded, align: 'right' },
      { header: '부분', value: (h) => h.partial, align: 'right' },
      { header: '실패', value: (h) => h.failed, align: 'right' },
      { header: '마지막', value: (h) => (h.lastStatus ? STATUS_LABEL[h.lastStatus] : null) },
      {
        header: '오류 종류별',
        value: (h) =>
          Object.entries(h.errorsByKind)
            .map(([kind, n]) => `${kind} ${n}`)
            .join(', ') || null,
      },
    ]),
  );
}

const PROPOSAL_STATUS: Record<Proposal['status'], string> = {
  blocked: '차단(가드)',
  pending: '검토 대기',
  approved: '승인됨',
  executed: '실행 완료',
  failed: '실행 실패',
  rejected: '거절',
  acknowledged: '확인',
};

function printProposals(proposals: Proposal[]) {
  if (proposals.length === 0) return console.log('제안이 없습니다.');
  console.log(
    renderTable(proposals, [
      { header: '#', value: (p) => p.id, align: 'right' },
      { header: '상태', value: (p) => PROPOSAL_STATUS[p.status] },
      { header: '종류', value: (p) => p.kind },
      { header: '제목', value: (p) => p.title.slice(0, 34) },
      {
        header: '가드',
        value: (p) =>
          p.checks
            .filter((c) => !c.passed)
            .map((c) => `✗ ${c.check}`)
            .join(' ') || '✓ 7/7',
      },
    ]),
  );
  for (const p of proposals.filter((p) => p.status === 'blocked')) {
    console.log(`\n  #${p.id} 차단 사유`);
    for (const c of p.checks.filter((c) => !c.passed)) console.log(`    - ${c.check}: ${c.detail}`);
  }
}

async function runAgentCommand(
  db: Db,
  [sub, idText]: string[],
  values: { planner?: string; reviewer?: string; note?: string },
) {
  const reviewer = values.reviewer ?? userInfo().username;
  const id = Number(idText);

  switch (sub) {
    case 'plan': {
      const planner = values.planner === 'claude' ? claudePlanner() : recordedPlanner();
      console.log(`계획자: ${planner.id}`);
      await planAndGuard(db, planner);
      return printProposals(listProposals(db, { limit: 20 }).reverse());
    }
    case 'list':
      return printProposals(listProposals(db).reverse());
    case 'approve': {
      const { mode, adapterFor } = adapterFactoryFromEnv();
      if (mode === 'recorded') console.log('실서비스 토큰이 없어 녹화 응답으로 실행합니다.');
      const result = await approve(db, id, { reviewer, note: values.note, adapterFor });
      console.log(
        `제안 #${id}: ${PROPOSAL_STATUS[result.status]}${result.resultRunId ? ` → 실행 #${result.resultRunId}` : ''}`,
      );
      if (result.status === 'blocked') printProposals([result]);
      return;
    }
    case 'reject':
      reject(db, id, { reviewer, note: values.note ?? '' });
      return console.log(`제안 #${id}: 거절`);
    case 'ack':
      acknowledge(db, id, { reviewer, note: values.note });
      return console.log(`제안 #${id}: 확인`);
    default:
      console.log('사용법: agent plan|list|approve|reject|ack');
  }
}

async function main(argv: string[]) {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      db: { type: 'string', default: DEFAULT_DB },
      scenario: { type: 'string', default: 'normal' },
      run: { type: 'string' },
      out: { type: 'string' },
      planner: { type: 'string', default: 'recorded' },
      reviewer: { type: 'string' },
      note: { type: 'string' },
    },
  });
  const [command = 'help', ...rest] = positionals;

  if (command === 'demo') {
    const scenario = SCENARIOS.find((name) => name === values.scenario);
    if (!scenario)
      throw new Error(`알 수 없는 시나리오: ${values.scenario} (가능: ${SCENARIOS.join(', ')})`);
    rmSync(values.db, { force: true });
    rmSync(`${values.db}-wal`, { force: true });
    rmSync(`${values.db}-shm`, { force: true });
    const db = openDatabase(values.db);
    console.log(`\n▶ 데모 시나리오: ${scenario} (녹화 응답, 실제 SNS 호출 없음)\n`);
    await runScenario(db, scenario, {
      onStep: (step, result) =>
        console.log(`  #${result.runId} ${STATUS_LABEL[result.status].padEnd(5)} ${step.label}`),
    });
    if (scenario === 'agent') {
      await runAgentDemo(db);
      console.log('\n■ 에이전트 제안 (녹화된 계획 응답 → 가드 → 검토 대기)\n');
      printProposals(listProposals(db).reverse());
    }
    console.log('\n■ 실행 기록\n');
    printRuns(db);
    console.log('\n■ 오류·경고\n');
    printErrors(db);
    console.log('\n■ 어댑터 상태\n');
    printHealth(db);
    console.log(`\nDB: ${values.db}\n`);
    return;
  }

  const db = openDatabase(values.db);
  switch (command) {
    case 'runs':
      return printRuns(db);
    case 'errors':
      return printErrors(db, values.run ? Number(values.run) : undefined);
    case 'health':
      return printHealth(db);
    case 'search':
      return console.log(
        renderTable(searchContents(db, { text: rest.join(' ') || undefined }), [
          { header: '플랫폼', value: (c) => c.platform },
          { header: '조회', value: (c) => c.metrics.views, align: 'right' },
          { header: '좋아요', value: (c) => c.metrics.likes, align: 'right' },
          { header: '캡션', value: (c) => c.caption.slice(0, 50) },
        ]),
      );
    case 'related': {
      const seed = rest[0];
      if (!seed) throw new Error('사용법: related <hashtag>');
      return console.log(
        renderTable(relatedHashtags(db, seed), [
          { header: '함께 쓰인 해시태그', value: (h) => `#${h.hashtag}` },
          { header: '콘텐츠', value: (h) => h.contents, align: 'right' },
          { header: '조회 합계', value: (h) => h.totalViews, align: 'right' },
        ]),
      );
    }
    case 'export': {
      if (!values.out) throw new Error('사용법: export --out <dir>');
      const out = resolve(values.out);
      mkdirSync(out, { recursive: true });
      writeFileSync(
        join(out, 'snapshot.json'),
        `${JSON.stringify(buildSnapshot(db, { scenario: values.scenario, dataMode: 'recorded' }), null, 2)}\n`,
      );
      return console.log(`스냅샷 저장: ${join(out, 'snapshot.json')}`);
    }
    case 'agent':
      return runAgentCommand(db, rest, values);
    default:
      console.log('명령: demo | runs | errors | health | search | related | export | agent');
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
