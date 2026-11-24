# 라이브 데모 이미지: 웹 화면 + API(방문자별 샌드박스, Claude 실시간 계획)를 한 프로세스로 제공한다.
FROM node:22-bookworm-slim

WORKDIR /app

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
