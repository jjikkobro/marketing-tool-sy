import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages는 /<저장소 이름>/ 아래에서 서비스된다. 배포 워크플로가 VITE_BASE를 넘긴다.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  server: {
    // npm run dev:live 일 때 collector 라이브 서버로 보낸다. API가 없으면 웹은 정적 스냅샷(읽기 전용)으로 동작한다.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
