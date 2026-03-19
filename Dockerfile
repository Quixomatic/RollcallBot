FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY src/ ./src/

ARG UID=1000
ARG GID=1000

RUN groupadd -g ${GID} rollcall || true && \
    useradd -u ${UID} -g ${GID} -m rollcall || true && \
    mkdir -p /app/data/browser-state && \
    chown -R ${UID}:${GID} /app

USER ${UID}:${GID}

VOLUME ["/app/data"]

CMD ["node", "src/index.js"]
