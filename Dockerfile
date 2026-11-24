# 라이브 데모 이미지: 웹 화면 + API(방문자별 샌드박스, Claude 실시간 계획)를 한 프로세스로 제공한다.
FROM node:22-bookworm-slim

WORKDIR /app

# better-sqlite3는 이 Node 버전용 사전 빌드가 없으면 소스로 컴파일한다. 경량 이미지에는 컴파일 도구가 없어
# npm ci가 "not found: make"로 실패했다 (CI에서 발견, 깨끗한 설치로 재현).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# 의존성 먼저 (레이어 캐시)
COPY package.json package-lock.json .nvmrc ./
COPY apps/collector/package.json apps/collector/
COPY apps/web/package.json apps/web/
RUN npm ci

# 시드 DB에 브라우저 수집(가상 피드 v1→v3) 단계를 넣으려면 Chromium이 필요하다
RUN npx playwright install --with-deps chromium

COPY . .
RUN npm run build -w @studio/web

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000
EXPOSE 10000

CMD ["npm", "run", "live", "-w", "@studio/collector"]
