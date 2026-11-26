# AGENTS.md

Instructions for AI coding agents working in this repository. Tool-agnostic;
`CLAUDE.md` imports this file.

## Project

discord-music-bot: Discord music bot with slash commands. Plays YouTube links,
playlists and search terms (YouTube Data API v3, `yt-dlp` fallback) and Spotify
links (resolved to metadata, matched to YouTube). Audio is streamed with
`yt-dlp` + `ffmpeg`. Optional Express web dashboard with Discord OAuth2 login.

Stack: Node.js >= 22.12 (CommonJS), `discord.js` 14, `@discordjs/voice`,
built-in `node:sqlite` (behind `--experimental-sqlite`), `express` 5,
`cookie-session`, ESLint 9 flat config, `node:test`. License per
`package.json`: MIT (no `LICENSE` file).

## Read first

1. `docs/README.md` (index).
2. The topic doc for the area you touch:

| Area | Doc |
| --- | --- |
| Overall structure, module map, flows, SQLite schema | `docs/architecture.md` |
| Environment variables | `docs/configuration.md` |
| Setup, lint, tests, conventions | `docs/development.md` |
| Docker image, compose, CI workflows | `docs/deployment.md` |

## Commands

```bash
npm ci          # install incl. dev deps
npm start       # node --experimental-sqlite src/index.js (needs .env, yt-dlp, ffmpeg)
npm run lint    # eslint .
npm test        # node --experimental-sqlite --test (isolated temp DATA_DIR)
```

Single test: `node --experimental-sqlite --test --test-name-pattern config test/queue.test.js`.

## Definition of done

- `npm run lint` and `npm test` pass (CI runs both on Gitea and GitHub).
- New behaviour in `src/config.js`, `src/db.js`, `src/player.js` or
  `src/queueEmbed.js` has a test in `test/`.
- Affected topic doc in `docs/` updated.
- New file `docs/changes/YYYY-MM-DD-<slug>.md` (template in
  `.claude/skills/document-change/SKILL.md`), listed in `docs/README.md`.
- User-visible behaviour, commands or env vars changed: update `README.md` and
  `.env.example`.
- `package.json` changed: `package-lock.json` updated in the same commit (CI job
  `verify-lockfile` fails otherwise).

## Hard rules

- Never commit `.env`, tokens, client secrets, API keys or `data/` contents.
  `.env.example` holds empty placeholders only.
- Every playback command and dashboard button calls `requireDj()`; every
  configuration command calls `requireAdmin()` (`src/permissions.js`). Web API
  routes go through `requireGuildAdmin` (`src/web/guildAccess.js`) and every
  state-changing route through `assertCsrf` (`src/web/api.js`).
- All state is per guild (`guild_id`). Never mix guilds in queries or caches.
- Schema changes are additive only: `CREATE TABLE IF NOT EXISTS` plus
  `ensureColumn()` in `src/db.js`. No migration framework.
- The currently playing track keeps its `queue` row until it finishes; shutdown
  must not clear the queue (restart resumes).
- Button `customId`s use the prefix `q:` and are handled in `handleButton()` in
  `src/index.js`; do not rename existing ids (`q:playpause`, `q:skip`,
  `q:stop`, `q:shuffle`, `q:loop`) because persisted dashboard messages use them.
- Do not rename the DB file `data/bot.db`, the table names `guild_config` and
  `queue`, or the image name `discord-music-bot`.
- Errors in Discord interactions are caught and answered with an ephemeral
  reply; one failing guild must never crash the process.
- Do not push to `main`, push tags `v*.*.*` or change registries unless the user
  asks.
- No emojis in code comments, logs or docs. (Existing emoji in Discord button
  labels and messages are UI and stay.)

## Language

| Artifact | Language |
| --- | --- |
| Code, comments, logs | English |
| Bot replies, embed and web UI texts | English |
| Commit messages, `docs/`, `README.md` | English |

Commits: Conventional Commits (`feat:`, `fix:`, `docs:`), imperative, no tool
attribution trailers.

## Project skills

Located in `.claude/skills/<name>/SKILL.md`. Other agents can read them as
step-by-step playbooks.

| Skill | Use for |
| --- | --- |
| `add-slash-command` | New slash command in `src/commands/` |
| `add-setting` | New environment variable |
| `add-db-column` | New column on `guild_config` or `queue` |
| `document-change` | Writing the `docs/changes/` record |
