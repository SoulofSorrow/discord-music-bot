# Configuration

All configuration is read from environment variables. `src/index.js` loads a
`.env` file via `dotenv`. Template: `.env.example`. Per-guild settings (bind,
follow, roles, volume, queue channel) are stored in SQLite, not in env vars.

## Environment variables

| Variable | Required | Default | Read in | Purpose |
| --- | --- | --- | --- | --- |
| `DISCORD_TOKEN` | yes | none | `src/index.js` | Bot token. Process exits if missing |
| `CLIENT_ID` | yes | none | `src/index.js`, `src/web/auth.js` | Application ID; also OAuth client ID for the web dashboard |
| `GUILD_ID` | no | unset | `src/index.js` | Register commands for one guild only (development) instead of globally |
| `YOUTUBE_API_KEY` | no | unset | `src/youtube.js` | YouTube Data API v3. Without it: `yt-dlp` search, single videos only |
| `SPOTIFY_CLIENT_ID` | no | unset | `src/spotify.js` | Spotify Client Credentials; needed for album and playlist links |
| `SPOTIFY_CLIENT_SECRET` | no | unset | `src/spotify.js` | Secret for the above |
| `ALLOW_CALLER_FALLBACK` | no | `true` (anything but `false`) | `src/commands/play.js`, `src/web/api.js` | Join the caller's channel when nothing is bound or followed |
| `IDLE_TIMEOUT_MS` | no | `300000` | `src/player.js` | Auto-leave delay; `0` disables |
| `YTDLP_COOKIES` | no | unset | `src/youtube.js` | Path to a Netscape cookies file for `yt-dlp` (takes precedence) |
| `YTDLP_COOKIES_FROM_BROWSER` | no | unset | `src/youtube.js` | Browser name for `yt-dlp --cookies-from-browser` |
| `VOICE_DEBUG` | no | `false` | `src/player.js` | `true` enables `@discordjs/voice` debug logging |
| `DATA_DIR` | no | `<repo>/data` | `src/db.js` | Directory of `bot.db`; tests set a temp dir. Not in `.env.example` |
| `WEB_ENABLED` | no | `false` | `src/index.js` | `true` starts the web dashboard |
| `WEB_PORT` | no | `3000` | `src/web/server.js`, `docker-compose.yml` | Dashboard port (plain HTTP) |
| `WEB_BASE_URL` | if web | none | `src/web/server.js`, `src/web/auth.js` | Public URL; OAuth redirect is `<WEB_BASE_URL>/auth/discord/callback`. `https://` enables secure cookies |
| `DISCORD_CLIENT_SECRET` | if web | none | `src/web/auth.js` | OAuth2 client secret of the same application |
| `SESSION_SECRET` | if web | none | `src/web/server.js` | Signs session cookies, e.g. `openssl rand -hex 32` |

With `WEB_ENABLED=true` and any of `DISCORD_CLIENT_SECRET`, `WEB_BASE_URL`,
`SESSION_SECRET` missing, the web dashboard is disabled with an error log; the
bot keeps running.

## Fixed constants (code, not configurable)

| Constant | Value | File |
| --- | --- | --- |
| `MAX_PLAY_ATTEMPTS` | `3` | `src/player.js` |
| `RETRY_DELAY_MS` | `1500` | `src/player.js` |
| `MIN_BYTES_FOR_SUCCESS` | `4096` | `src/player.js` |
| `DEBOUNCE_MS` | `1500` | `src/dashboard.js` |
| Session `maxAge` | 7 days | `src/web/server.js` |

## Rules

- Secrets only in `.env` (git-ignored) or a secret store; never in code,
  `.env.example` or docs.
- New variables: add to `.env.example` with a comment, to this table and to
  `README.md`.
