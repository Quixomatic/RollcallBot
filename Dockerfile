# --- Dashboard UI (Vite + React), built once and copied into the runtime image ---
FROM node:22-slim AS dashboard

WORKDIR /dashboard
RUN npm install -g pnpm@10.11.0

COPY dashboard/package.json dashboard/pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile

COPY dashboard/ ./
RUN pnpm build

# --- Runtime ---
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

# Xvfb gives the dashboard's remote-login Chrome a (virtual) display
RUN apt-get update && apt-get install -y --no-install-recommends xvfb && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install build tools for better-sqlite3 native compilation + pnpm
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && \
    npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile --prod

# Real Google Chrome for the dashboard's remote Meetup login (it passes Meetup's
# captcha where automation-launched Chromium gets flagged). Google only ships
# Chrome for amd64; elsewhere remote login falls back to Playwright's Chromium.
RUN if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
      npx playwright install --with-deps chrome && rm -rf /var/lib/apt/lists/*; \
    else echo "Skipping Google Chrome (not amd64)"; fi

COPY src/ ./src/
COPY docs/ ./docs/
COPY --from=dashboard /dashboard/dist ./dashboard/dist

ARG UID=1000
ARG GID=1000

RUN groupadd -g ${GID} rollcall 2>/dev/null || true && \
    useradd -u ${UID} -g ${GID} -m rollcall 2>/dev/null || true && \
    mkdir -p /app/data/browser-state && \
    chown -R ${UID}:${GID} /app

ENV PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

USER ${UID}:${GID}

VOLUME ["/app/data"]

# Web dashboard (enabled by DASHBOARD_PASSWORD), including remote Meetup login
EXPOSE 3000

CMD ["/usr/bin/node", "src/index.js"]
