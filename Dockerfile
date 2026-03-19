FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY src/ ./src/

RUN mkdir -p /app/data/browser-state && chown -R pwuser:pwuser /app

USER pwuser

VOLUME ["/app/data"]

CMD ["node", "src/index.js"]
