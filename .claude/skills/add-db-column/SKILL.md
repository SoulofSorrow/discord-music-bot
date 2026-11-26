---
name: add-db-column
description: Add a column to the SQLite tables guild_config or queue in discord-music-bot using ensureColumn() in src/db.js. Use when a per-guild setting or queue item needs a new persisted field.
---

# Add a database column

Background: `docs/architecture.md`, section "SQLite schema".

## Steps

1. **Schema** in `src/db.js`:
   - Add the column to the `CREATE TABLE IF NOT EXISTS` statement (fresh
     databases).
   - Add `ensureColumn('<table>', '<column>', '<DECL>')` after the existing
     calls (existing databases). `DECL` must allow `NULL` or carry a
     `DEFAULT`.
2. **Statements** in `src/db.js`: extend `_upsertConfig` (column list,
   `VALUES` placeholders, `ON CONFLICT ... DO UPDATE SET`) or
   `_insertQueueItem` and the matching JS function.
3. **Mapping**:
   - `guild_config`: add the field to `DEFAULT_CONFIG`, `rowToConfig()` and
     `configToRow()` in `src/config.js`, plus a setter if needed.
   - `queue`: map it in `GuildPlayer.restoreFromDb()` in `src/player.js`.
4. **Tests** in `test/queue.test.js`: value round-trips through SQLite.
5. **Docs**: schema table in `docs/architecture.md`; then the
   `document-change` skill.
6. Run `npm run lint` and `npm test`.

## Not supported

Dropping, renaming or retyping columns. Stop and ask the user; there is no
migration framework.
