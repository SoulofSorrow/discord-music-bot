# discord-music-bot

Discord music bot with slash commands. Plays **YouTube** links/playlists and search terms (via the
YouTube Data API v3) as well as **Spotify** links (track / album / playlist / episode). Audio is streamed
from YouTube: Spotify links are resolved to metadata and matched to a YouTube video, then streamed with
`yt-dlp` + `ffmpeg`.

Highlights:

- **YouTube Data API v3** for search, video and playlist resolution (falls back to `yt-dlp` scraping when
  no API key is set — single videos only in that mode).
- **Two permission tiers** — *DJ* roles control playback, *Admin* roles configure the bot.
- **Follow mode** — the bot joins, moves, and rejoins with a chosen user automatically, and keeps the queue
  while they're away.
- **SQLite-persisted queue & config** — the queue and all per-guild settings survive restarts; a
  bound-channel guild even resumes playback on boot.

## Commands

### Playback (DJ tier)

- `/play link:<url-or-search>` — play a YouTube link/playlist, a Spotify link, or a free-text search term
- `/skip` — skip the current track
- `/pause` / `/resume`
- `/volume [percent]` — set (0–200) or show playback volume
- `/queue` — show what's playing and what's up next (open to everyone)
- `/remove position:<n>` — remove an up-next track by its position
- `/move from:<n> to:<n>` — reorder an up-next track
- `/clear` — clear the up-next queue (current track keeps playing)
- `/shuffle` — randomly shuffle the up-next queue
- `/loop [off|track|queue]` — repeat mode (omit to cycle)
- `/stop` — clear the queue and leave voice
- `/leave` — leave voice without clearing the queue

### Configuration (Admin tier)

- `/bind channel:<#voice-channel>` — lock the bot to one voice channel
- `/follow user:<@user>` — bot joins/moves/rejoins with that user automatically
- `/unbind` — clear bind/follow
- `/role add|remove tier:<dj|admin> role:<@role>` — manage the permission tiers
- `/role list` — show configured DJ and admin roles
- `/queue-channel set channel:<#text-channel>` — post a single, self-updating queue message in a channel
- `/queue-channel off` — stop the live queue display

## Permission tiers

- **DJ** gates all playback commands (`/play`, `/skip`, `/pause`, `/resume`, `/volume`, `/stop`, `/leave`).
  With **no DJ roles configured, everyone** may control playback; as soon as one DJ role is added, only
  members with a DJ role (or an admin) can.
- **Admin** gates the configuration commands (`/bind`, `/follow`, `/unbind`, `/role`). A member qualifies as
  admin if they have Discord's **Manage Server** permission **or** one of the configured admin roles. Admins
  always satisfy the DJ tier too.

> Admin commands are gated in-code (not via Discord's per-command permissions), so admin **roles** work
> without touching Server Settings. If you'd rather hide these commands from most members entirely, restrict
> their visibility under Server Settings → Integrations.

## Live queue channel

`/queue-channel set` designates a text channel where the bot maintains **one** embed message showing the
current track and what's up next, plus a **button control panel** (⏸️/▶️ · ⏭️ · ⏹️ · 🔀 · 🔁). The buttons
are DJ-gated just like the commands. It refreshes automatically on every change (play, skip, enqueue, pause,
stop) — updates are debounced so a big playlist enqueue is a single edit. The message id is persisted, so
the same message keeps updating across restarts; if it gets deleted, the bot recreates it on the next
change. `/queue-channel off` disables it.

## Auto-leave

The bot leaves voice after `IDLE_TIMEOUT_MS` (default 5 min) with an empty queue, or when it's left alone
with no human listeners. If a queue is still pending when it's left alone, it suspends (keeps the queue) and
resumes on demand rather than discarding it. Set `IDLE_TIMEOUT_MS=0` to disable.

### Target resolution for `/play`

1. If `/follow` is set → the followed user's current channel (errors if they're not in voice).
2. Else if `/bind` is set → that channel.
3. Else if `ALLOW_CALLER_FALLBACK=true` (default) → the caller's current voice channel.
4. Else → asks an admin to `/bind` or `/follow`.

## Persistence

State lives in a SQLite database at `data/bot.db` (created automatically):

- **guild_config** — bind/follow target, volume, DJ/admin roles, last text channel.
- **queue** — one row per queued track. The queue is restored into memory on startup. A **bound-channel**
  guild rejoins and resumes automatically; a **follow-mode** guild resumes as soon as the followed user is
  next seen in a voice channel.

A pre-existing `data/guilds.json` from an older version is imported into SQLite once on first start and then
renamed to `guilds.json.migrated`.

## Setup

1. Create a Discord application + bot at https://discord.com/developers/applications, enable the
   **Server Members Intent** (needed for role checks and follow mode), and invite it with the `bot` +
   `applications.commands` scopes and at least: View Channel, Connect, Speak, Send Messages.
2. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`, `CLIENT_ID`, optionally `GUILD_ID`.
3. Add `YOUTUBE_API_KEY` (Google Cloud console → enable **YouTube Data API v3**) for reliable search and
   playlist support.
4. Optionally add `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` for album/playlist links.

### Run in Docker (recommended)

```bash
docker compose up -d --build
```

Reads env vars from `.env`, bundles `yt-dlp` + `ffmpeg`, and persists `./data` (SQLite DB) via a bind mount
so state survives restarts/rebuilds. Update after pulling new code with the same command.

### Run locally

Requires Node ≥ 22.12, plus `yt-dlp` and `ffmpeg` on `PATH`.

```bash
npm install
npm start
```

`npm start` runs with `--experimental-sqlite` (the built-in `node:sqlite` module is behind that flag in the
Node 22.x line). Expect a harmless `ExperimentalWarning` on boot.

### Development

```bash
npm ci          # install incl. dev deps
npm run lint    # ESLint (flat config)
npm test        # node:test runner (uses an isolated temp DATA_DIR)
```

CI runs on Gitea Actions (`.gitea/workflows/ci.yml`): `lint`, `test`, and a multi-arch
(`linux/amd64` + `linux/arm64`) Docker build.

## Notes

- The queue's currently-playing track keeps its DB row until it finishes, so an unexpected restart replays
  it from the start rather than dropping it. On `SIGINT`/`SIGTERM` the bot stops playback and checkpoints the
  SQLite WAL **without** clearing the queue, so `docker compose restart` resumes cleanly.
- For age-restricted videos or bot-detection challenges, set `YTDLP_COOKIES` (path to a Netscape cookies
  file) or `YTDLP_COOKIES_FROM_BROWSER` (e.g. `chrome`); see the
  [yt-dlp docs](https://github.com/yt-dlp/yt-dlp#authentication-with-cookies).
