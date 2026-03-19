FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

# Install noVNC for web-based browser access during login
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11vnc novnc websockify && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile --prod

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
