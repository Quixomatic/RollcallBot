FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

# Install noVNC for web-based browser access during login
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11vnc novnc websockify && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install build tools for better-sqlite3 native compilation + pnpm
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && \
    npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile --prod && \
    apt-get purge -y python3 make g++ && \
    apt-mark manual nodejs && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

COPY src/ ./src/

# Create user with UID/GID 1000 and ensure node is in PATH
ARG UID=1000
ARG GID=1000

RUN groupadd -g ${GID} rollcall 2>/dev/null || true && \
    useradd -u ${UID} -g ${GID} -m rollcall 2>/dev/null || true && \
    mkdir -p /app/data/browser-state && \
    chown -R ${UID}:${GID} /app && \
    ln -sf $(which node) /usr/local/bin/node 2>/dev/null || true && \
    ln -sf $(which npm) /usr/local/bin/npm 2>/dev/null || true && \
    ln -sf $(which npx) /usr/local/bin/npx 2>/dev/null || true

USER ${UID}:${GID}

VOLUME ["/app/data"]

CMD ["node", "src/index.js"]
