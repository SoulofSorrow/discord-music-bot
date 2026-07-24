const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'guilds.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let store = load();

const DEFAULT_CONFIG = { mode: null, channelId: null, userId: null, allowedRoleIds: [], volume: 100 };

function getGuildConfig(guildId) {
  const existing = store[guildId];
  if (!existing) return { ...DEFAULT_CONFIG };
  return { ...DEFAULT_CONFIG, ...existing };
}

function setBoundChannel(guildId, channelId) {
  const current = getGuildConfig(guildId);
  store[guildId] = { ...current, mode: 'channel', channelId, userId: null };
  save(store);
}

function setFollowUser(guildId, userId) {
  const current = getGuildConfig(guildId);
  store[guildId] = { ...current, mode: 'follow', channelId: null, userId };
  save(store);
}

function clearTarget(guildId) {
  const current = getGuildConfig(guildId);
  store[guildId] = { ...current, mode: null, channelId: null, userId: null };
  save(store);
}

function addAllowedRole(guildId, roleId) {
  const current = getGuildConfig(guildId);
  if (!current.allowedRoleIds.includes(roleId)) current.allowedRoleIds.push(roleId);
  store[guildId] = current;
  save(store);
  return current.allowedRoleIds;
}

function removeAllowedRole(guildId, roleId) {
  const current = getGuildConfig(guildId);
  current.allowedRoleIds = current.allowedRoleIds.filter((id) => id !== roleId);
  store[guildId] = current;
  save(store);
  return current.allowedRoleIds;
}

function setVolume(guildId, volume) {
  const current = getGuildConfig(guildId);
  store[guildId] = { ...current, volume };
  save(store);
}

module.exports = {
  getGuildConfig,
  setBoundChannel,
  setFollowUser,
  clearTarget,
  addAllowedRole,
  removeAllowedRole,
  setVolume,
};
