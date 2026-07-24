const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'bot.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id         TEXT PRIMARY KEY,
    mode             TEXT,
    channel_id       TEXT,
    user_id          TEXT,
    text_channel_id  TEXT,
    queue_channel_id TEXT,
    queue_message_id TEXT,
    volume           INTEGER NOT NULL DEFAULT 100,
    dj_role_ids      TEXT NOT NULL DEFAULT '[]',
    admin_role_ids   TEXT NOT NULL DEFAULT '[]'
  );
`);

// Idempotently add columns introduced after a guild_config table already exists.
function ensureColumn(table, column, decl) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}
ensureColumn('guild_config', 'queue_channel_id', 'TEXT');
ensureColumn('guild_config', 'queue_message_id', 'TEXT');

// One row per queued track. Insertion order (id) is the play order. The track
// that is currently playing keeps its row until it finishes, so a restart can
// replay it from the start rather than losing it.
db.exec(`
  CREATE TABLE IF NOT EXISTS queue (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id      TEXT NOT NULL,
    title         TEXT NOT NULL,
    artist        TEXT,
    url           TEXT,
    search_query  TEXT,
    requested_by  TEXT
  );
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_queue_guild ON queue(guild_id, id);');

// --- guild_config access -------------------------------------------------

const _getConfig = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
const _upsertConfig = db.prepare(`
  INSERT INTO guild_config
    (guild_id, mode, channel_id, user_id, text_channel_id, queue_channel_id, queue_message_id, volume, dj_role_ids, admin_role_ids)
  VALUES (@guild_id, @mode, @channel_id, @user_id, @text_channel_id, @queue_channel_id, @queue_message_id, @volume, @dj_role_ids, @admin_role_ids)
  ON CONFLICT(guild_id) DO UPDATE SET
    mode             = excluded.mode,
    channel_id       = excluded.channel_id,
    user_id          = excluded.user_id,
    text_channel_id  = excluded.text_channel_id,
    queue_channel_id = excluded.queue_channel_id,
    queue_message_id = excluded.queue_message_id,
    volume           = excluded.volume,
    dj_role_ids      = excluded.dj_role_ids,
    admin_role_ids   = excluded.admin_role_ids
`);

function getConfigRow(guildId) {
  return _getConfig.get(guildId) || null;
}

function upsertConfigRow(row) {
  _upsertConfig.run(row);
}

// --- queue access --------------------------------------------------------

const _loadQueue = db.prepare('SELECT * FROM queue WHERE guild_id = ? ORDER BY id ASC');
const _insertQueueItem = db.prepare(`
  INSERT INTO queue (guild_id, title, artist, url, search_query, requested_by)
  VALUES (@guild_id, @title, @artist, @url, @search_query, @requested_by)
`);
const _deleteQueueItem = db.prepare('DELETE FROM queue WHERE id = ?');
const _clearGuildQueue = db.prepare('DELETE FROM queue WHERE guild_id = ?');
const _guildsWithQueue = db.prepare('SELECT DISTINCT guild_id FROM queue');
const _guildsWithDashboard = db.prepare(
  'SELECT guild_id FROM guild_config WHERE queue_channel_id IS NOT NULL'
);

function loadQueueRows(guildId) {
  return _loadQueue.all(guildId);
}

function insertQueueItem(item) {
  const info = _insertQueueItem.run({
    guild_id: item.guildId,
    title: item.title,
    artist: item.artist ?? null,
    url: item.url ?? null,
    search_query: item.searchQuery ?? null,
    requested_by: item.requestedBy ?? null,
  });
  return Number(info.lastInsertRowid);
}

function deleteQueueItem(id) {
  if (id != null) _deleteQueueItem.run(id);
}

function clearGuildQueue(guildId) {
  _clearGuildQueue.run(guildId);
}

function guildsWithQueue() {
  return _guildsWithQueue.all().map((r) => r.guild_id);
}

function guildsWithDashboard() {
  return _guildsWithDashboard.all().map((r) => r.guild_id);
}

// Checkpoint the WAL into the main DB file and close the handle (used on shutdown).
function close() {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    /* best effort */
  }
  db.close();
}

module.exports = {
  db,
  getConfigRow,
  upsertConfigRow,
  loadQueueRows,
  insertQueueItem,
  deleteQueueItem,
  clearGuildQueue,
  guildsWithQueue,
  guildsWithDashboard,
  close,
};
