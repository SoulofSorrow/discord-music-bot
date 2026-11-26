# Deployment

## Docker image (`Dockerfile`)

- Base `node:22-alpine`; `apk add yt-dlp ffmpeg`.
- `npm ci --omit=dev`; only `src/` is copied.
- `VOLUME /app/data` (SQLite DB).
- `CMD ["node", "--experimental-sqlite", "src/index.js"]`.
- No `.dockerignore` in the repository; the `COPY` lines only take
  `package.json`, `package-lock.json` and `src/`.

## Compose (`docker-compose.yml`)

| Key | Value |
| --- | --- |
| Service | `discord-music` |
| Image | `ghcr.io/soulofsorrow/discord-music-bot:latest` |
| `container_name` | `discord-music-bot` |
| `env_file` | `.env` |
| Volume | `./data:/app/data` |
| Port | `127.0.0.1:${WEB_PORT:-3000}:${WEB_PORT:-3000}` (loopback only, put a reverse proxy in front for TLS) |

Update: `docker compose pull && docker compose up -d`.

## CI

Emulation: `docker/setup-qemu-action` is pinned to `tonistiigi/binfmt:qemu-v9.2.2`; with `latest` (QEMU 10) Node crashed with `Illegal instruction` in the arm64 build and the job hung. Job `build-and-push` has `timeout-minutes: 45`.

Two equivalent workflows, triggered on push to `main`, tags `v*.*.*`, pull
requests to `main` and manual dispatch:

| File | Registry | Notes |
| --- | --- | --- |
| `.gitea/workflows/ci.yml` | `${vars.REGISTRY_GITEA}` or `gitea.groot.rocks` | Runs in `catthehacker/ubuntu:act-latest`; Docker via `docker:27-dind` service |
| `.github/workflows/ci.yml` | `ghcr.io` | PR builds `linux/amd64` only; GHA build cache |

Jobs: `verify-lockfile` (`npm install --package-lock-only` must not change
`package-lock.json`) -> `lint` and `test` -> `build-and-push` (multi-arch
`linux/amd64,linux/arm64`, push skipped for pull requests).

Image tags (`docker/metadata-action`): branch name, `pr-<n>`, semver
`{{version}}` and `{{major}}.{{minor}}` on tags, `sha-<short>`, `latest` on the
default branch.

## Release

No release tooling in the repository. Pushing a tag `v*.*.*` builds and pushes
versioned images. `package.json` `version` is not updated automatically.
