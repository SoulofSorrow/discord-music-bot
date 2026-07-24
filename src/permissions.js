const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getGuildConfig } = require('./config');

async function loadMember(interaction) {
  // interaction.member's role cache can be partial; fetch to be safe.
  return interaction.guild.members.fetch(interaction.user.id);
}

function hasAnyRole(member, roleIds) {
  return roleIds.some((id) => member.roles.cache.has(id));
}

// Admin: Manage Server permission, or one of the configured admin roles.
function isAdmin(member, config) {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return hasAnyRole(member, config.adminRoleIds);
}

// DJ: admins always qualify. If no DJ roles are configured the tier is open to
// everyone; once any DJ role exists, only those roles (and admins) qualify.
function isDj(member, config) {
  if (isAdmin(member, config)) return true;
  if (config.djRoleIds.length === 0) return true;
  return hasAnyRole(member, config.djRoleIds);
}

function reject(interaction, message) {
  return interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
}

// Guard helpers used at the top of a command. They reply with an ephemeral
// error and return false when the caller is not permitted.
async function requireDj(interaction) {
  const config = getGuildConfig(interaction.guild.id);
  const member = await loadMember(interaction);
  if (isDj(member, config)) return true;
  await reject(
    interaction,
    `You don't have permission for that. Allowed DJ roles: ${config.djRoleIds
      .map((id) => `<@&${id}>`)
      .join(', ')}`
  );
  return false;
}

async function requireAdmin(interaction) {
  const config = getGuildConfig(interaction.guild.id);
  const member = await loadMember(interaction);
  if (isAdmin(member, config)) return true;
  await reject(
    interaction,
    'You need the **Manage Server** permission or an admin role to use that command.'
  );
  return false;
}

module.exports = { isAdmin, isDj, requireDj, requireAdmin };
