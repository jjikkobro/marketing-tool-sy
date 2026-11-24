/**
 * GitHub Pages는 SPA 라우팅을 모른다. /operations 같은 주소로 바로 들어오면 404가 난다.
 * index.html을 404.html로 복사해 두면 Pages가 404 응답으로 앱을 내려주고, 라우터가 경로를 처리한다.
 */
import { copyFileSync } from 'node:fs';

copyFileSync(
  new URL('../dist/index.html', import.meta.url),
  new URL('../dist/404.html', import.meta.url),
);
