# Architecture

## Summary

- Single Node.js process (CommonJS), entry point `src/index.js`.
- Discord gateway client (`discord.js` 14) with intents `Guilds`,
  `GuildVoiceStates`, `GuildMembers`.
- Voice playback via `@discordjs/voice`; audio from a `yt-dlp` child process
  piped through `ffmpeg` (`createAudioProcess()` in `src/youtube.js`).
- Storage: SQLite file `data/bot.db` via built-in `node:sqlite` (`DatabaseSync`,
  WAL mode). `DATA_DIR` overrides the directory.
- Optional Express web dashboard (`WEB_ENABLED=true`) in the same process.
- No external queue, cache or scheduler.

## Module map

| Path | Responsibility |
| --- | --- |
| `src/index.js` | Env check, client setup, command loading and registration, `restoreQueues()`, `interactionCreate`, `handleButton()`, follow-mode and auto-leave `voiceStateUpdate` handlers, graceful `shutdown()` |
| `src/commands/*.js` | One slash command per file; exports `{ data: SlashCommandBuilder, execute(interaction) }`. Loaded automatically by filename |
| `src/permissions.js` | `isAdmin()`, `isDj()`, `requireDj()`, `requireAdmin()` |
| `src/config.js` | Per-guild config on top of `guild_config` (`getGuildConfig()`, setters, `addRole()`, `removeRole()`); one-time `migrateLegacyJson()` from `data/guilds.json` |
| `src/db.js` | Opens the DB, creates tables, `ensureColumn()`, prepared statements, `close()` (WAL checkpoint) |
| `src/player.js` | `GuildPlayer` class (queue, playback, retries, loop modes, idle timer); `getGuildPlayer()`, `peekGuildPlayer()`, `shutdownAll()`, `waitForConnectionReady()` |
| `src/resolveLink.js` | `resolveLinkOrSearch()`: dispatches YouTube URL, Spotify URL or search text; shared by `/play` and the web API |
| `src/youtube.js` | YouTube Data API v3 calls, `yt-dlp` fallbacks, cookie args, `createAudioProcess()` |
| `src/spotify.js` | Spotify Client Credentials token, track/album/playlist/episode resolution, oEmbed fallback |
| `src/queueEmbed.js` | `buildQueueEmbed()` for `/queue` and the live dashboard |
| `src/dashboard.js` | Live queue message: `updateDashboard()`, debounced `scheduleDashboardUpdate()` (1500 ms), `q:*` buttons |
| `src/events.js` | In-process `EventEmitter`; event `queueUpdate` with payload `guildId` |
| `src/web/server.js` | `startWebServer()`: Express app, `cookie-session`, OAuth routes, `/api/session`, static files |
| `src/web/auth.js` | Discord OAuth2 helpers: `buildAuthorizeUrl()`, `exchangeCode()`, `fetchDiscordUser()` |
| `src/web/guildAccess.js` | `listAdminGuilds()`, middleware `requireGuildAdmin` |
| `src/web/api.js` | Router under `/api/guilds/:guildId`: `GET /status`, `POST /play`, `/control`, `/queue/remove`, `/queue/move`; `assertCsrf` |
| `src/web/public/`, `src/web/views/dashboard.html` | Browser dashboard (plain JS and CSS) |
| `test/queue.test.js` | `node:test` suite for config, player queue operations, embed |
| `todo.md` | Feature list (German), done and deferred items |

## Interaction flow (slash command)

1. `interactionCreate` in `src/index.js` looks up `client.commands` by name.
2. The command's `execute()` first calls `requireDj()` or `requireAdmin()`;
   on rejection that helper replies ephemerally and returns `false`.
3. Errors thrown by `execute()` are caught and answered with an ephemeral
   "Something went wrong" message.
4. Commands are registered on `clientReady`: per guild when `GUILD_ID` is set,
   globally otherwise.

## Playback flow

1. `/play` (or `POST /api/guilds/:guildId/play`) resolves the target voice
   channel: follow user > bound channel > caller channel (only if
   `ALLOW_CALLER_FALLBACK` is not `false`).
2. `resolveLinkOrSearch()` returns `{ parsed, items }`.
3. `GuildPlayer.enqueue()` inserts each item into the `queue` table and the
   in-memory queue; `playNext()` starts playback if idle.
4. `attemptPlay()` spawns `yt-dlp` + `ffmpeg`, retries up to
   `MAX_PLAY_ATTEMPTS` (3) with `RETRY_DELAY_MS` (1500).
5. Every state change calls `notifyChange()`, which emits `queueUpdate`;
   `src/index.js` triggers `scheduleDashboardUpdate()`.
6. Auto-leave: `scheduleLeave()` after `IDLE_TIMEOUT_MS` with an empty queue or
   no human listeners; with a pending queue it suspends instead of clearing.

## Startup and shutdown

- `clientReady`: register commands, `restoreQueues()` (bound-channel guilds
  rejoin and resume; follow-mode guilds wait for `voiceStateUpdate`), redraw
  dashboards, start the web server if enabled and configured.
- `SIGINT`/`SIGTERM`: `shutdownAll()`, wait 1 s for the voice leave to flush,
  `close()` the DB with WAL checkpoint, exit. The queue is kept.

## Web dashboard flow

1. `GET /auth/discord/login` stores a random `state` in the session and
   redirects to Discord.
2. `GET /auth/discord/callback` checks `state`, exchanges the code, stores
   `discordUserId`, `username`, `avatar` and a new `csrfToken` in the session.
3. `GET /api/session` lists guilds where the bot is present and the user passes
   `isAdmin()`.
4. `/api/guilds/:guildId/*` re-checks admin status on every request;
   `POST` routes require header `x-csrf-token` equal to the session token.

## SQLite schema (`src/db.js`)

| Table | Columns | Notes |
| --- | --- | --- |
| `guild_config` | `guild_id` (PK), `mode`, `channel_id`, `user_id`, `text_channel_id`, `queue_channel_id`, `queue_message_id`, `volume` (default 100), `dj_role_ids`, `admin_role_ids` (JSON arrays as text) | `mode` is `channel`, `follow` or `NULL` |
| `queue` | `id` (PK autoincrement, defines play order), `guild_id`, `title`, `artist`, `url`, `search_query`, `requested_by` | Index `idx_queue_guild(guild_id, id)` |

Columns added after the first release are created by `ensureColumn()`
(`queue_channel_id`, `queue_message_id`).

## Invariants

- Permission checks happen in code, not via Discord command permissions.
- No DJ roles configured means everyone passes `isDj()`; admins always pass.
- Admin = Discord `ManageGuild` permission or a configured admin role.
- The current track's `queue` row is deleted only when the track finishes.
- Reordering rewrites `queue` rows (`reorderPersist()`), because `id` is the
  play order.
