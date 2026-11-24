/**
 * 로컬 개발: 라이브 서버(API)와 웹 개발 서버(Vite, 화면 즉시 반영)를 함께 띄운다.
 * 웹은 /api를 검토 API로 프록시하고, 화면에서 제안을 승인·거절할 수 있게 된다.
 */
import { spawn } from 'node:child_process';

const children = [
  spawn('npm', ['run', 'live', '-w', '@studio/collector'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev', '-w', '@studio/web'], { stdio: 'inherit' }),
];

function stop() {
  for (const child of children) child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => code && stop());
