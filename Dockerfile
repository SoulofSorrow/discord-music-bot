# syntax=docker/dockerfile:1

# npm runs on the build host architecture (BUILDPLATFORM), never under QEMU
# emulation: node/npm crash there for arm64 ("Illegal instruction" in the V8
# JIT) and the build hangs. The only native dependency, @snazzah/davey, ships
# prebuilt binaries per platform as optional dependencies; --os/--cpu make npm
# install the ones for the target platform instead of the build host.

# Deps stage: production dependencies for the target platform.
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
ARG TARGETARCH
WORKDIR /app
COPY package.json package-lock.json ./
RUN case "${TARGETARCH}" in \
        amd64) npm_cpu=x64 ;; \
        arm64) npm_cpu=arm64 ;; \
        arm) npm_cpu=arm ;; \
        *) echo "unsupported TARGETARCH '${TARGETARCH}'" >&2; exit 1 ;; \
    esac \
    && npm ci --omit=dev --os=linux --cpu="${npm_cpu}" --no-audit --no-fund \
    && test -d "node_modules/@snazzah/davey-linux-${npm_cpu}-musl" \
    && npm cache clean --force

# Runtime stage: target platform, no npm invocations.
FROM node:22-alpine

RUN apk add --no-cache yt-dlp ffmpeg

WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules

COPY src ./src

VOLUME ["/app/data"]

CMD ["node", "--experimental-sqlite", "src/index.js"]
