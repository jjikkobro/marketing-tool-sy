/**
 * 공개 저장소에 이전 직장의 서비스명·계정명이 들어가지 않았는지 검사한다.
 * 금지어 목록 자체도 공개되면 안 되므로, 평문이 아니라 SHA-256 해시로 둔다.
 * 추적 중인 파일의 모든 단어(영문·숫자·한글 토큰)를 해시해서 목록과 비교한다.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BLOCKED = new Set([
  // 원문은 지원자만 안다. 추가: node -e "console.log(require('crypto').createHash('sha256').update('<단어>'.toLowerCase()).digest('hex'))"
  ...(process.env.LEAK_HASHES ?? '').split(',').filter(Boolean),
  ...readFileSync(new URL('./blocked-terms.sha256', import.meta.url), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')),
]);

// 인자로 파일을 주면 그 파일만 검사한다 (검사기 자체를 시험할 때 쓴다).
const files = (
  process.argv.length > 2
    ? process.argv.slice(2)
    : execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0')
) // -z: 한글 파일명을 이스케이프하지 않음
  .filter(
    (file) =>
      file && !/\.(png|jpe?g|gif|woff2?|ico|lock)$/.test(file) && file !== 'package-lock.json',
  );

const hits = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const token of new Set(text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])) {
    for (const part of [token, ...token.split('_')]) {
      if (BLOCKED.has(createHash('sha256').update(part).digest('hex'))) hits.push(file);
    }
  }
}

if (hits.length > 0) {
  console.error(`금지어가 포함된 파일:\n${[...new Set(hits)].map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(`금지어 검사 통과 (${files.length}개 파일)`);
