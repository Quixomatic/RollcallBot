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
    rm -rf /var/lib/apt/lists/*

# Verify node survived the cleanup
RUN node --version

COPY src/ ./src/

ARG UID=1000
ARG GID=1000

RUN groupadd -g ${GID} rollcall 2>/dev/null || true && \
    useradd -u ${UID} -g ${GID} -m rollcall 2>/dev/null || true && \
    mkdir -p /app/data/browser-state && \
    chown -R ${UID}:${GID} /app

ENV PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

USER ${UID}:${GID}

VOLUME ["/app/data"]

CMD ["/usr/bin/node", "src/index.js"]
