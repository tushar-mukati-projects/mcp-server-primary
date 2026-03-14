FROM oven/bun:1 AS base
WORKDIR /app

# Node.js is required to run playwright-worker.cjs
# (Bun's IPC model is incompatible with Playwright's browser subprocess)
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs npm \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Download Chromium binary + install all OS-level dependencies it needs
RUN npx playwright install-deps chromium \
    && npx playwright install chromium

COPY src ./src
COPY tsconfig.json ./

EXPOSE 3001
CMD ["bun", "src/index.ts"]
