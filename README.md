# discord-spotify-bot

Discord bot that plays Spotify links (track / album / playlist / episode) in a voice channel. Audio itself
comes from YouTube (Spotify has no public API for raw audio) — the bot resolves the Spotify link's metadata,
searches YouTube for a match, and streams that.

## Commands

- `/play link:<spotify-url>` — resolve a Spotify link and queue it (joins voice if needed)
- `/skip` — skip the current track
- `/pause` / `/resume`
- `/queue` — show what's playing and up next
- `/stop` — clear queue and leave voice
- `/leave` — leave voice without touching queue/bind settings
- `/bind channel:<#voice-channel>` — *(Manage Server)* lock the bot to one voice channel
- `/follow user:<@user>` — *(Manage Server)* bot joins/moves with that user automatically
- `/unbind` — *(Manage Server)* clear bind/follow
- `/allow-role add|remove|list role:<@role>` — *(Manage Server)* restrict who can use `/play` to specific roles.
  With no roles configured, everyone can queue songs; as soon as one role is added, only members with an
  allowed role can queue.

### Target resolution for `/play`

1. If `/follow` is set → joins the followed user's current channel (errors if they're not in voice).
2. Else if `/bind` is set → uses that channel.
3. Else if `ALLOW_CALLER_FALLBACK=true` (default) → uses the caller's current voice channel.
4. Else → tells the user to ask an admin to `/bind` or `/follow`.

## Setup

1. Create a Discord application + bot at https://discord.com/developers/applications, enable the
   **Server Members Intent** under Bot settings (needed for role checks and follow mode), and invite it
   with the `bot` + `applications.commands` scopes and at least: View Channel, Connect, Speak, Send Messages.
2. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`, `CLIENT_ID`, and optionally `GUILD_ID`
   (instant command registration for one server — omit for global commands, which take up to an hour to
   propagate).
3. Optionally add `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` (Client Credentials app at
   https://developer.spotify.com/dashboard) — required for album/playlist links and more reliable track
   metadata. Without them, only single track/episode links work (via Spotify's public oEmbed endpoint).

### Run locally

```bash
npm install
npm start
```

### Run in Docker (recommended)

```bash
docker compose up -d --build
```

This builds the image, reads env vars from `.env`, and persists per-guild settings (bind/follow/allowed
roles) in `./data/guilds.json` via a bind-mounted volume — so they survive container restarts/rebuilds.

To update after pulling new code:

```bash
docker compose up -d --build
```

## Notes

- Bot/role permission gate is enforced in-bot (`/allow-role`), independent of Discord's own per-command
  integration permissions — you can additionally restrict command *visibility* in Server Settings →
  Integrations if you want the command hidden entirely rather than just rejected.
- YouTube playback occasionally needs `play-dl` cookies/token setup if you hit age-restricted or
  bot-detection errors; see the [play-dl docs](https://github.com/play-dl/play-dl/blob/main/instructions/authorization.md) if that happens.
