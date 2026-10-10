# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — build: the static examples site (packages/editor/dist-examples/)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app

# Pin to the latest npm before installing anything. The npm bundled in the base
# image can lag by weeks; newer npm ships fixes and stricter registry handling
# that reduce exposure to supply-chain attacks. Its own cached layer so it only
# re-runs when the base image changes.
RUN npm install -g npm@latest

# Install from the lockfile. This is an npm-workspaces monorepo, so copy the root
# manifest + lock AND the one workspace manifest first — this layer is cached
# until the dependencies actually change. The only scoped dependency
# (@keenmate/web-components-core) resolves from the public npm registry (see
# package-lock.json), so no registry auth is needed in the build.
COPY package.json package-lock.json ./
COPY packages/editor/package.json ./packages/editor/package.json
RUN npm ci --no-audit --no-fund

# Bring in the source and build the examples as a multi-page Vite app. Unlike the
# library build (lib mode → dist/), this one (vite.examples.config.ts) treats every
# examples-*.html as an entry, bundles the TS the pages reference (/src/index.ts and
# the dev harnesses /src/dev/*.ts), resolves the ?inline CSS, and rewrites every
# asset path — emitting a self-contained static site in dist-examples/. host
# node_modules/ and build output are excluded via .dockerignore for a clean build.
COPY . .
RUN npm run build:examples -w @keenmate/web-editor

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — serve: the static examples site via nginx
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:alpine AS serve

# Replace the stock server block with one that serves the static site and silently
# drops vulnerability-scanner traffic (see nginx.conf).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# The Vite MPA build is fully self-contained (hashed /assets/* + the HTML pages),
# so the served root is just its output — no /src tree, no path rewriting needed.
COPY --from=build /app/packages/editor/dist-examples/ /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
