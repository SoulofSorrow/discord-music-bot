---
name: add-slash-command
description: Add a new slash command to discord-music-bot (file in src/commands/, permission tier, player call, docs). Use when the user asks for a new bot command or subcommand.
---

# Add a slash command

Background: `docs/architecture.md`, sections "Module map" and "Interaction
flow". Reference implementations: `src/commands/skip.js` (DJ, simple),
`src/commands/role.js` (admin, subcommands).

## Steps

1. **File**: create `src/commands/<name>.js`. It is loaded automatically by
   `src/index.js`; the file must export:

   ```js
   module.exports = {
     data: new SlashCommandBuilder().setName('<name>').setDescription('...'),
     async execute(interaction) { ... },
   };
   ```

   `data.name` must be unique across `src/commands/`.
2. **Permission tier** as the first line of `execute()`:
   - Playback control: `if (!(await requireDj(interaction))) return;`
   - Bot configuration: `if (!(await requireAdmin(interaction))) return;`
   - Read-only for everyone (like `/queue`): no guard.
3. **Logic**:
   - Player state: `getGuildPlayer(interaction.guild.id)` (creates) or
     `peekGuildPlayer()` (returns `null` if none) from `src/player.js`.
   - Guild settings: helpers in `src/config.js`; new persisted fields follow
     the `add-db-column` skill.
   - `GuildPlayer` methods already call `notifyChange()`; a new player method
     that changes queue or playback state must call it too, so the live
     dashboard refreshes.
   - User errors: ephemeral reply. Long work: `interaction.deferReply()` then
     `editReply()`.
   - Suppress mentions when rendering IDs: `allowedMentions: { parse: [] }`.
4. **Web parity** (optional): if the action should be available in the web
   dashboard, add an action in `src/web/api.js` behind `assertCsrf` and the UI
   in `src/web/public/dashboard.js`.
5. **Tests**: add cases to `test/` for any new logic in `src/player.js`,
   `src/config.js` or `src/queueEmbed.js`.
6. **Docs**: command list and tier list in `README.md` (sections "Commands"
   and "Permission tiers"); `docs/architecture.md` if a new module or flow
   appears; then the `document-change` skill.
7. Run `npm run lint` and `npm test`.

## Notes

- Global command registration can take up to an hour; set `GUILD_ID` in `.env`
  for instant updates on a test server.
- Buttons are not commands: new dashboard buttons use `customId` `q:<action>`
  in `src/dashboard.js` and a `case` in `handleButton()` in `src/index.js`.
