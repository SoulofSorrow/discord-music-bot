const { getGuildConfig } = require('../config');
const { isAdmin } = require('../permissions');

// Binds the Discord client so route handlers can look up guilds/members
// without threading `client` through every function signature.
function createGuildAccess(client) {
  // Re-fetches the member fresh (roles can change) and runs the same
  // isAdmin() check used for Discord slash commands.
  async function isGuildAdmin(guildId, discordUserId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) return false;
    return isAdmin(member, getGuildConfig(guildId));
  }

  // Checks every guild the bot itself is in (not the user's OAuth guild list —
  // fetching that requires the "guilds" scope and can be large enough to blow
  // the browser's ~4KB session-cookie limit) and keeps the ones where the user
  // passes isGuildAdmin(). Used to populate the post-login guild picker.
  async function listAdminGuilds(discordUserId) {
    const guilds = [...client.guilds.cache.values()];
    const results = await Promise.all(
      guilds.map(async (g) => ((await isGuildAdmin(g.id, discordUserId)) ? g : null))
    );
    return results.filter(Boolean).map((g) => ({ id: g.id, name: g.name, icon: g.icon }));
  }

  // Express middleware for routes shaped /api/guilds/:guildId/*. Requires a
  // logged-in session (see server.js) and re-verifies admin status per request.
  async function requireGuildAdmin(req, res, next) {
    const discordUserId = req.session?.discordUserId;
    if (!discordUserId) return res.status(401).json({ error: 'Not logged in.' });

    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Bot is not in that server.' });

    if (!(await isGuildAdmin(guild.id, discordUserId))) {
      return res.status(403).json({ error: 'You are not an admin on that server.' });
    }

    req.guild = guild;
    next();
  }

  return { listAdminGuilds, requireGuildAdmin };
}

module.exports = { createGuildAccess };
