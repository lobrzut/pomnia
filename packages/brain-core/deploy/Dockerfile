# syntax=docker/dockerfile:1
#
# brain-core — MCP server + RAG, standalone.
#
# Build from the REPOSITORY ROOT, not from this directory:
#   docker build -f packages/brain-core/deploy/Dockerfile -t pomnia/brain-core .
#
# better-sqlite3 is a native module: it is installed inside the image so it
# matches the container's Node ABI. Copying node_modules from the host produces
# a binary compiled for the wrong NODE_MODULE_VERSION and fails at first query.

FROM node:22-bookworm-slim AS build
WORKDIR /src

# Manifests first so a dependency-only change reuses the install layer.
COPY package.json package-lock.json ./
COPY packages/brain-core/package.json packages/brain-core/
RUN npm ci --workspace @pomnia/brain-core --include-workspace-root=false

COPY packages/brain-core/ packages/brain-core/
RUN npm run build --prefix packages/brain-core \
 && npm prune --omit=dev --workspace @pomnia/brain-core


FROM node:22-bookworm-slim AS runtime
# Non-root: the process reads a vault and writes one SQLite file.
RUN useradd --system --create-home --uid 10001 pomnia
WORKDIR /opt/pomnia/brain-core

COPY --from=build /src/node_modules /opt/pomnia/node_modules
COPY --from=build /src/packages/brain-core/dist ./dist
COPY --from=build /src/packages/brain-core/package.json ./package.json

# BRAIN_PORT rather than a --port in CMD: arguments after the image name replace
# CMD wholesale, so `docker run … pomnia/brain-core --host 0.0.0.0` used to drop
# the port with it and the daemon fell back to 7862 while -p published 7865.
# The container then listened on a port nobody had mapped — and the healthcheck,
# which probed the listening port from inside, reported it healthy the whole
# time. An env var survives a CMD override; a CMD argument does not.
#
# 7865 is the server port. 7862 belongs to the desktop-embedded brain and, on a
# machine migrating from the Python stack, is already taken by it.
#
# Embed cache under /opt (not /var/lib/pomnia): a VOLUME or -v on the data dir
# must not hide the ~0.5 GB ONNX weights baked at build.
ENV NODE_ENV=production \
    NODE_PATH=/opt/pomnia/node_modules \
    BRAIN_DATA_DIR=/var/lib/pomnia \
    BRAIN_PORT=7865 \
    BRAIN_EMBED_BACKEND=fastembed \
    BRAIN_EMBED_CACHE=/opt/pomnia/embed-cache

RUN mkdir -p /opt/pomnia/embed-cache /var/lib/pomnia \
 && BRAIN_EMBED_BACKEND=fastembed \
    BRAIN_EMBED_CACHE=/opt/pomnia/embed-cache \
    node dist/daemon.js --data-dir /var/lib/pomnia --prefetch-embed \
 && chown -R pomnia:pomnia /opt/pomnia/embed-cache /var/lib/pomnia

# The vault and the index are state — mount them, do not bake them in.
VOLUME ["/var/lib/pomnia"]
USER pomnia

EXPOSE 7865

# /healthz answers before any token exists, which is what a probe needs.
# Reads BRAIN_PORT so overriding the port cannot leave the probe checking a
# different one than the server bound — a green healthcheck for a port the
# outside world cannot reach is worse than no healthcheck.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "const p=process.env.BRAIN_PORT||7865;fetch('http://127.0.0.1:'+p+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 0.0.0.0 makes the port reachable outside the container, which turns Bearer
# auth on. Put tokens in /var/lib/pomnia/mcp-tokens.json before exposing it —
# with no tokens file every request is refused, by design.
ENTRYPOINT ["node", "dist/daemon.js"]
CMD ["--host", "0.0.0.0", "--data-dir", "/var/lib/pomnia", "--vault-root", "/var/lib/pomnia/vault"]
