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

ENV NODE_ENV=production \
    NODE_PATH=/opt/pomnia/node_modules \
    BRAIN_DATA_DIR=/var/lib/pomnia

# The vault and the index are state — mount them, do not bake them in.
VOLUME ["/var/lib/pomnia"]
RUN mkdir -p /var/lib/pomnia && chown -R pomnia:pomnia /var/lib/pomnia
USER pomnia

EXPOSE 7862

# /healthz answers before any token exists, which is what a probe needs.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:7862/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 0.0.0.0 makes the port reachable outside the container, which turns Bearer
# auth on. Put tokens in /var/lib/pomnia/mcp-tokens.json before exposing it —
# with no tokens file every request is refused, by design.
ENTRYPOINT ["node", "dist/daemon.js"]
CMD ["--host", "0.0.0.0", "--port", "7862", "--data-dir", "/var/lib/pomnia", "--vault-root", "/var/lib/pomnia/vault"]
