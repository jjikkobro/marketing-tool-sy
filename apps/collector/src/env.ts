/**
 * apps/collector/.env를 읽는다 (있을 때만). 이미 설정된 환경변수는 덮어쓰지 않는다.
 * 키는 웹(apps/web)이 아니라 여기에 둔다. 웹의 .env에 VITE_ 접두사로 넣으면 브라우저 번들에 그대로 실려 공개된다.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve(import.meta.dirname, '../.env');
if (existsSync(path)) process.loadEnvFile(path);
