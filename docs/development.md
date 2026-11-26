# Development

## Prerequisites

- Node.js `>=22.12.0` (`engines` in `package.json`; CI uses Node 22).
- `yt-dlp` and `ffmpeg` on `PATH` for real playback (not needed for tests).
- A `.env` copied from `.env.example` for running the bot (not needed for
  tests).

## npm scripts (`package.json`)

| Command | Effect |
| --- | --- |
| `npm ci` | Install exact dependencies from `package-lock.json` |
| `npm start` | `node --experimental-sqlite src/index.js` |
| `npm run lint` | `eslint .` with `eslint.config.js` |
| `npm test` | `node --experimental-sqlite --test` |

`--experimental-sqlite` is required because `node:sqlite` is flagged in Node
22.x. An `ExperimentalWarning` on start is expected.

## Lint

- ESLint 9 flat config `eslint.config.js`: `@eslint/js` recommended, Node
  globals, CommonJS; `src/web/public/**/*.js` uses browser globals.
- Rules: `no-unused-vars` warns (args prefixed `_` ignored); empty `catch`
  allowed.
- Ignored: `node_modules/`, `data/`.

## Tests

- Single file `test/queue.test.js`, `node:test` + `node:assert/strict`.
- The test sets `process.env.DATA_DIR` to a temp dir before requiring
  `src/db.js`, because `src/db.js` opens the DB at load time. New test files
  must do the same.
- Covered: guild config round-trip, role add/remove, player
  `enqueue`/`move`/`shuffle`/`removeAt`/`clearUpcoming`, loop modes,
  `restoreFromDb()`, `buildQueueEmbed()`.
- Not covered: Discord interactions, voice, YouTube/Spotify HTTP, web routes.

## Conventions

- `.editorconfig`: UTF-8, LF, 2-space indent, final newline.
- CommonJS `require`/`module.exports`; no TypeScript, no build step.
- Commands reply ephemerally on user errors (`ephemeral: true` or
  `MessageFlags.Ephemeral`).
- Mentions in bot replies are suppressed with `allowedMentions: { parse: [] }`
  where role or user IDs are rendered.
- After changing `package.json`, run `npm install` and commit
  `package-lock.json`.
