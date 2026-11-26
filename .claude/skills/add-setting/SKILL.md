---
name: add-setting
description: Add a new environment variable to discord-music-bot. Use when a feature needs a process-wide configurable value (not a per-guild setting).
---

# Add an environment variable

Background: `docs/configuration.md`. Per-guild settings belong in SQLite
(`add-db-column` skill), not in env vars.

## Steps

1. **Read** the variable via `process.env.NAME` in the module that uses it,
   with an explicit default. Existing pattern:
   `const IDLE_TIMEOUT_MS = Number(process.env.IDLE_TIMEOUT_MS ?? 300000);`.
   Booleans compare against the string (`=== 'true'` or `!== 'false'`).
2. **Required variables**: validate at startup in `src/index.js` and log a
   clear error. Feature-scoped variables (like the web dashboard ones) disable
   only that feature instead of exiting.
3. **Template**: add to `.env.example` with a comment. Secrets get an empty
   value and, where useful, a generation hint such as `openssl rand -hex 32`.
4. **Compose**: `docker-compose.yml` passes `.env` via `env_file`; edit it only
   if the variable also affects ports or volumes.
5. **Docs**: row in `docs/configuration.md`; mention in `README.md` if users
   need to set it; then the `document-change` skill.
6. Run `npm run lint` and `npm test`.

## Rules

- Never hardcode secrets or real-looking example values.
- A new required variable is a breaking change: set `breaking: true` in the
  change file.
