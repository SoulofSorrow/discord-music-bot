const fs = require('fs');
const path = require('path');
const { getConfigRow, upsertConfigRow } = require('./db');

const DEFAULT_CONFIG = {
  mode: null,
  channelId: null,
  userId: null,
  textChannelId: null,
  queueChannelId: null,
  queueMessageId: null,
  volume: 100,
  djRoleIds: [],
  adminRoleIds: [],
};

function rowToConfig(row) {
  if (!row) return { ...DEFAULT_CONFIG };
  return {
    mode: row.mode ?? null,
    channelId: row.channel_id ?? null,
    userId: row.user_id ?? null,
    textChannelId: row.text_channel_id ?? null,
    queueChannelId: row.queue_channel_id ?? null,
    queueMessageId: row.queue_message_id ?? null,
    volume: row.volume ?? 100,
    djRoleIds: safeParseArray(row.dj_role_ids),
    adminRoleIds: safeParseArray(row.admin_role_ids),
  };
}

function safeParseArray(json) {
  try {
    const value = JSON.parse(json || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function configToRow(guildId, config) {
  return {
    guild_id: guildId,
    mode: config.mode,
    channel_id: config.channelId,
    user_id: config.userId,
    text_channel_id: config.textChannelId,
    queue_channel_id: config.queueChannelId,
    queue_message_id: config.queueMessageId,
    volume: config.volume,
    dj_role_ids: JSON.stringify(config.djRoleIds),
    admin_role_ids: JSON.stringify(config.adminRoleIds),
  };
}

function getGuildConfig(guildId) {
  return rowToConfig(getConfigRow(guildId));
}

function updateGuildConfig(guildId, patch) {
  const next = { ...getGuildConfig(guildId), ...patch };
  upsertConfigRow(configToRow(guildId, next));
  return next;
}

function setBoundChannel(guildId, channelId) {
  updateGuildConfig(guildId, { mode: 'channel', channelId, userId: null });
}

function setFollowUser(guildId, userId) {
  updateGuildConfig(guildId, { mode: 'follow', channelId: null, userId });
}

function clearTarget(guildId) {
  updateGuildConfig(guildId, { mode: null, channelId: null, userId: null });
}

function setTextChannel(guildId, textChannelId) {
  updateGuildConfig(guildId, { textChannelId });
}

function setQueueChannel(guildId, queueChannelId) {
  // Switching channels invalidates the old dashboard message.
  updateGuildConfig(guildId, { queueChannelId, queueMessageId: null });
}

function clearQueueChannel(guildId) {
  updateGuildConfig(guildId, { queueChannelId: null, queueMessageId: null });
}

function setQueueMessageId(guildId, queueMessageId) {
  updateGuildConfig(guildId, { queueMessageId });
}

function setVolume(guildId, volume) {
  updateGuildConfig(guildId, { volume });
}

function addRole(guildId, tier, roleId) {
  const key = tier === 'admin' ? 'adminRoleIds' : 'djRoleIds';
  const current = getGuildConfig(guildId);
  if (!current[key].includes(roleId)) current[key].push(roleId);
  updateGuildConfig(guildId, { [key]: current[key] });
  return current[key];
}

function removeRole(guildId, tier, roleId) {
  const key = tier === 'admin' ? 'adminRoleIds' : 'djRoleIds';
  const current = getGuildConfig(guildId);
  const next = current[key].filter((id) => id !== roleId);
  updateGuildConfig(guildId, { [key]: next });
  return next;
}

// One-time import of the legacy data/guilds.json into SQLite. allowedRoleIds
// map onto the new DJ tier. The file is renamed afterwards so this runs once.
function migrateLegacyJson() {
  const legacyPath = path.join(__dirname, '..', 'data', 'guilds.json');
  if (!fs.existsSync(legacyPath)) return;
  try {
    const store = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    for (const [guildId, cfg] of Object.entries(store)) {
      if (getConfigRow(guildId)) continue; // already in DB, don't clobber
      updateGuildConfig(guildId, {
        mode: cfg.mode ?? null,
        channelId: cfg.channelId ?? null,
        userId: cfg.userId ?? null,
        volume: cfg.volume ?? 100,
        djRoleIds: Array.isArray(cfg.allowedRoleIds) ? cfg.allowedRoleIds : [],
      });
    }
    fs.renameSync(legacyPath, `${legacyPath}.migrated`);
    console.log(`Migrated ${Object.keys(store).length} guild(s) from guilds.json into SQLite.`);
  } catch (err) {
    console.error('Failed to migrate legacy guilds.json:', err.message);
  }
}

migrateLegacyJson();

module.exports = {
  getGuildConfig,
  setBoundChannel,
  setFollowUser,
  clearTarget,
  setTextChannel,
  setQueueChannel,
  clearQueueChannel,
  setQueueMessageId,
  setVolume,
  addRole,
  removeRole,
};
